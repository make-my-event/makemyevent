import "server-only";
import {
	asUser as runAsUser,
	createClient,
	type Limits,
	type Person,
	type PrismaClient,
	SCHEMA_KEY,
	type Tx,
} from "@makemyevent/db";

/**
 * The database, for server code only.
 *
 * One client per server process, on globalThis: Next.js loads this module
 * several times in one process (pages, server actions and routes each get
 * their own copy, in production too), and in development again on every
 * edit. They must share one pool, and one copy must never close the pool
 * another is using.
 *
 * The client is replaced only when the schema it was made from changed,
 * which happens in development, when the Prisma client is regenerated under
 * a running server. The old one is closed later, once what it was running
 * has finished.
 */
const globalForDb = globalThis as unknown as {
	database?: { client: PrismaClient; schema: string };
};

/** Longer than any transaction may run. */
const RETIRE_MS = 60_000;

function database(): PrismaClient {
	const held = globalForDb.database;
	if (held?.schema === SCHEMA_KEY) return held.client;
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set");
	const client = createClient(url);
	globalForDb.database = { client, schema: SCHEMA_KEY };
	if (held) setTimeout(() => void held.client.$disconnect(), RETIRE_MS).unref();
	return client;
}

/**
 * Runs `work` as this person, under row-level security. The caller passes who
 * getCurrentUser answered with, whose level has been verified too, never
 * anything the browser sent.
 */
export function asUser<T>(
	person: Person,
	work: (tx: Tx) => Promise<T>,
	limits?: Limits,
): Promise<T> {
	return runAsUser(database(), person, work, limits);
}

/**
 * Runs `work` as a visitor: no one signed in, so the policies show only what
 * is public. For pages anyone may open, such as a guest's ticket from its
 * signed link, which reads through its own narrow function.
 */
export function asVisitor<T>(
	work: (tx: Tx) => Promise<T>,
	limits?: Limits,
): Promise<T> {
	return runAsUser(database(), null, work, limits);
}
