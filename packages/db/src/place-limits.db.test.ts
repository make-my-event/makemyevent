import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

/**
 * Place limits under concurrent writes, against a real Postgres with every
 * migration applied (CI's): N confirmations at once against N-1 places must
 * leave exactly N-1, whichever tickets they're on.
 *
 * Each confirmation runs as the app does: its own connection and
 * transaction, as app_user, as the event's owner at the second step. All of
 * them start their transaction and wait until every one is ready, then
 * write at once, so they really race.
 *
 * Runs only when RUN_DB_TESTS=1 (CI), against DIRECT_URL: it commits rows,
 * which stay in that throwaway database. The audit log is append-only, so
 * an event with an entry can't be deleted, by design.
 */

const run = process.env.RUN_DB_TESTS === "1" && process.env.DIRECT_URL;
const skip = run ? false : "RUN_DB_TESTS=1 and DIRECT_URL are needed";
const N = 20;

let pool: pg.Pool;
const host = randomUUID();

before(async () => {
	if (!run) return;
	pool = new pg.Pool({ connectionString: process.env.DIRECT_URL, max: N + 2 });
	await pool.query(
		"INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Host')",
		[host, `host-${host}@test.local`],
	);
});

after(async () => {
	await pool?.end();
});

async function event(capacity: number | null, tickets: (number | null)[]) {
	const id = randomUUID();
	await pool.query(
		"INSERT INTO events (id, host_user_id, slug, title, capacity) VALUES ($1, $2, $3, 'Limits', $4)",
		[id, host, `limits-${id}`, capacity],
	);
	const ticketIds: string[] = [];
	for (const [i, places] of tickets.entries()) {
		const ticket = randomUUID();
		await pool.query(
			"INSERT INTO ticket_types (id, event_id, name, capacity) VALUES ($1, $2, $3, $4)",
			[ticket, id, `Ticket ${i + 1}`, places],
		);
		ticketIds.push(ticket);
	}
	return { id, tickets: ticketIds };
}

type Outcome = "ok" | "event full" | "ticket full";

/**
 * N confirmations at once: the i-th on tickets[i % tickets.length], each in
 * its own transaction. `pastLimits` asks for the organizer's override first.
 */
async function race(
	eventId: string,
	tickets: string[],
	count: number,
	pastLimits = false,
): Promise<Outcome[]> {
	const clients = await Promise.all(
		Array.from({ length: count }, () => pool.connect()),
	);
	try {
		await Promise.all(
			clients.map(async (c) => {
				await c.query("BEGIN");
				await c.query("SET LOCAL ROLE app_user");
				await c.query(
					"SELECT set_config('app.user_id', $1, true), set_config('app.aal', 'aal2', true)",
					[host],
				);
				if (pastLimits)
					await c.query("SELECT app.allow_past_limits($1)", [eventId]);
			}),
		);
		return await Promise.all(
			clients.map(async (c, i): Promise<Outcome> => {
				try {
					await c.query(
						`INSERT INTO registrations
						   (event_id, ticket_type_id, attendee_name, attendee_email, source)
						 VALUES ($1, $2, 'Guest', $3, 'invite')`,
						[
							eventId,
							tickets[i % tickets.length],
							`g${i}-${randomUUID()}@test.local`,
						],
					);
					await c.query("COMMIT");
					return "ok";
				} catch (error) {
					await c.query("ROLLBACK");
					const e = error as { code?: string; message?: string };
					if (
						e.code === "23514" &&
						(e.message === "event full" || e.message === "ticket full")
					)
						return e.message;
					throw error;
				}
			}),
		);
	} finally {
		for (const c of clients) c.release();
	}
}

async function held(eventId: string) {
	const { rows } = await pool.query<{ counted: string; stored: string }>(
		`SELECT
		   (SELECT count(*) FROM registrations
		     WHERE event_id = $1 AND status = 'confirmed') AS counted,
		   (SELECT coalesce(sum(registered_count), 0) FROM ticket_types
		     WHERE event_id = $1) AS stored`,
		[eventId],
	);
	const row = rows[0];
	assert.ok(row);
	// The kept counts agree with the rows themselves.
	assert.equal(row.stored, row.counted);
	return Number(row.counted);
}

test("the event's limit holds across its tickets under concurrent confirmations", {
	skip,
}, async () => {
	// A ticket each, with no limit of its own: nothing but the event's lock
	// keeps confirmations on different tickets from passing each other.
	const e = await event(
		N - 1,
		Array.from({ length: N }, () => null),
	);
	const outcomes = await race(e.id, e.tickets, N);
	assert.equal(outcomes.filter((o) => o === "ok").length, N - 1);
	assert.deepEqual(
		outcomes.filter((o) => o !== "ok"),
		["event full"],
	);
	assert.equal(await held(e.id), N - 1);
});

test("a ticket's own limit holds under concurrent confirmations", {
	skip,
}, async () => {
	const e = await event(null, [N - 1]);
	const outcomes = await race(e.id, e.tickets, N);
	assert.equal(outcomes.filter((o) => o === "ok").length, N - 1);
	assert.deepEqual(
		outcomes.filter((o) => o !== "ok"),
		["ticket full"],
	);
	assert.equal(await held(e.id), N - 1);
});

test("an organizer's override goes past the limit, and each is audited", {
	skip,
}, async () => {
	const e = await event(2, [null]);
	assert.deepEqual(await race(e.id, e.tickets, 2), ["ok", "ok"]);
	// Full: refused without the override, allowed with it.
	assert.deepEqual(await race(e.id, e.tickets, 1), ["event full"]);
	assert.deepEqual(await race(e.id, e.tickets, 1, true), ["ok"]);
	assert.equal(await held(e.id), 3);

	const { rows } = await pool.query<{
		actor_id: string;
		target_id: string;
		details: Record<string, unknown>;
	}>(
		`SELECT actor_id, target_id, details FROM audit_log
			  WHERE event_id = $1 AND action = 'guest.past_limit'`,
		[e.id],
	);
	assert.equal(rows.length, 1);
	const entry = rows[0];
	assert.ok(entry);
	assert.equal(entry.actor_id, host);
	assert.deepEqual(entry.details, {
		ticket: e.tickets[0],
		event_held: 3,
		event_limit: 2,
		ticket_held: 3,
		ticket_limit: null,
		past: "event",
	});
	const { rows: guest } = await pool.query(
		"SELECT 1 FROM registrations WHERE id = $1 AND event_id = $2 AND status = 'confirmed'",
		[entry.target_id, e.id],
	);
	assert.equal(guest.length, 1);
});
