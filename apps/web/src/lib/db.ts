import "server-only";
import {
	asUser as runAsUser,
	createClient,
	type PrismaClient,
	type Tx,
} from "@makemyevent/db";

/**
 * The database, for server code only.
 *
 * One client per server process. In development the module is re-run on
 * every edit, so the client is kept on globalThis rather than opening a new
 * pool each time.
 *
 * Kept with the createClient it came from. Regenerating the Prisma client
 * (after a schema change) reloads @makemyevent/db with a new createClient,
 * and a client made by the old one does not know the new columns; so a
 * changed createClient means a fresh client, and the old pool is closed.
 * In production the module loads once and this never fires.
 */
const globalForDb = globalThis as unknown as {
	database?: { client: PrismaClient; madeBy: typeof createClient };
};

function database(): PrismaClient {
	const held = globalForDb.database;
	if (held?.madeBy === createClient) return held.client;
	if (held) void held.client.$disconnect();
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set");
	const client = createClient(url);
	globalForDb.database = { client, madeBy: createClient };
	return client;
}

/**
 * Runs `work` as this user, under row-level security. The caller passes an
 * id it has already verified (getCurrentUser), never one the browser sent.
 */
export function asUser<T>(
	userId: string,
	work: (tx: Tx) => Promise<T>,
): Promise<T> {
	return runAsUser(database(), userId, work);
}
