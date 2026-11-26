// Removes someone's authenticator, for a person who lost it and has no
// recovery codes left. They set up a new one the next time they sign in.
//
//   node --env-file=<that environment's file> packages/db/scripts/reset-two-step.mjs <project-ref> <email>
//
// First make sure it is them: they must write from the address they sign in
// with, and confirm something only they would know, such as their draft
// events. An email alone is what two-step sign-in protects against.
//
// The project's ref is typed, and checked against the environment, so the
// wrong project is never touched. The reset is written to the audit log
// before anything is removed; no log entry, no reset.
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { poolOptions } from "../src/tls.ts";

const require = createRequire(import.meta.url);
// The driver Prisma's adapter brings with it.
const pg = createRequire(require.resolve("@prisma/adapter-pg"))("pg");

function stop(message) {
	console.error(message);
	process.exit(1);
}

const [ref, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!ref || !email) stop("Usage: reset-two-step.mjs <project-ref> <email>");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const database = process.env.DATABASE_URL;
if (!url || !key || !database)
	stop("SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL must be set.");
if (new URL(url).hostname !== `${ref}.supabase.co`)
	stop(`This environment is not project ${ref}. Nothing was changed.`);
const { hostname, username } = new URL(database);
if (
	hostname !== "localhost" &&
	!decodeURIComponent(username).endsWith(`.${ref}`) &&
	hostname !== `db.${ref}.supabase.co`
)
	stop(`DATABASE_URL is not project ${ref}'s database. Nothing was changed.`);

async function admin(method, path) {
	const response = await fetch(`${url}/auth/v1/admin${path}`, {
		method,
		headers: { apikey: key, Authorization: `Bearer ${key}` },
	});
	if (!response.ok)
		stop(`Supabase answered ${response.status} to ${method} ${path}.`);
	return response.json();
}

let user;
for (let page = 1; !user; page++) {
	const { users } = await admin("GET", `/users?page=${page}&per_page=200`);
	user = users.find((u) => u.email?.toLowerCase() === email);
	if (users.length < 200) break;
}
if (!user) stop(`No account with that email on ${ref}.`);
const factors = await admin("GET", `/users/${user.id}/factors`);
if (factors.length === 0)
	stop("That account has no authenticator. Nothing to reset.");

console.log(
	`Project ${ref}, account made ${user.created_at.slice(0, 10)}, ${factors.length} authenticator(s).`,
);
const prompt = createInterface({
	input: process.stdin,
	output: process.stdout,
});
const typed = await prompt.question("Type the email again to reset it: ");
prompt.close();
if (typed.trim().toLowerCase() !== email)
	stop("Not the same. Nothing was changed.");

const client = new pg.Client(poolOptions(database));
await client.connect();
try {
	await client.query("BEGIN");
	await client.query("SET LOCAL ROLE app_user");
	await client.query("SELECT set_config('app.user_id', $1, true)", [user.id]);
	await client.query("SELECT app.record_two_step('reset')");
	await client.query("COMMIT");
} catch (error) {
	stop(`The audit log refused it: ${error.message}. Nothing was changed.`);
} finally {
	await client.end();
}

for (const factor of factors)
	await admin("DELETE", `/users/${user.id}/factors/${factor.id}`);
console.log("Reset, and recorded. Tell them it is done, and to sign in again.");
