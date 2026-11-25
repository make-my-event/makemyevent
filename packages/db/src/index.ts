import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/client/client";
import { poolOptions } from "./tls";

export { Prisma } from "../generated/client/client";
export type { PrismaClient };

/**
 * Every column this client knows, as one string: the same in each copy of
 * this module a bundler makes, and different once the client is regenerated
 * from a changed schema.
 */
export const SCHEMA_KEY: string = JSON.stringify(
	Object.entries(Prisma).filter(([name]) => name.endsWith("ScalarFieldEnum")),
);

/** A transaction handle, as passed to the callback of `asUser`. */
export type Tx = Prisma.TransactionClient;

/**
 * A client over one connection string, through the node-postgres driver.
 * Supabase connections are encrypted and verified (see ./tls).
 */
export function createClient(connectionString: string): PrismaClient {
	return new PrismaClient({
		adapter: new PrismaPg(poolOptions(connectionString)),
	});
}

/**
 * How long a transaction may take, in milliseconds. Prisma's own limits (2 s
 * to connect, 5 s to finish) are shorter than a cold server's first
 * connection or a big event's work can need.
 */
export type Limits = {
	/** Waiting for a connection: a cold server makes its first, with TLS. */
	maxWait: number;
	/** From BEGIN to COMMIT. */
	timeout: number;
};

/** For a page or a save: long enough never to bite, short enough to free a stuck connection. */
export const USUAL_LIMITS: Limits = { maxWait: 10_000, timeout: 10_000 };

/** For work over a whole guest list: an import or an export. */
export const BULK_LIMITS: Limits = { maxWait: 10_000, timeout: 50_000 };

/**
 * Runs `work` in one transaction as the signed-in person, under row-level
 * security.
 *
 * The connection's own login owns the tables and so bypasses every policy;
 * user traffic never runs as it. Each transaction drops to the `app_user`
 * role and names the person, both for that transaction only, so a pooled
 * connection carries nothing to the next request. `userId` null is a visitor:
 * the policies show them only what is public.
 *
 * `userId` must come from a session the server has verified, never from the
 * request.
 */
export function asUser<T>(
	db: PrismaClient,
	userId: string | null,
	work: (tx: Tx) => Promise<T>,
	limits: Limits = USUAL_LIMITS,
): Promise<T> {
	return db.$transaction(async (tx) => {
		await tx.$executeRawUnsafe("SET LOCAL ROLE app_user");
		await tx.$queryRaw`SELECT set_config('app.user_id', ${userId ?? ""}, true)`;
		return work(tx);
	}, limits);
}
