import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "../generated/client/client";
import { poolOptions } from "./tls";

export { Prisma } from "../generated/client/client";
export type { PrismaClient };

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
): Promise<T> {
	return db.$transaction(async (tx) => {
		await tx.$executeRawUnsafe("SET LOCAL ROLE app_user");
		await tx.$queryRaw`SELECT set_config('app.user_id', ${userId ?? ""}, true)`;
		return work(tx);
	});
}
