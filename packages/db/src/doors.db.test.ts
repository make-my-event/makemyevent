import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

/**
 * Doors under concurrent writes, against a real Postgres with every
 * migration applied (CI's): organizers assigning volunteers at the moment
 * another turns doors off, or retires the door they're assigning to. No
 * assignment may outlive the switch or its door.
 *
 * Runs only when RUN_DB_TESTS=1 (CI), against DIRECT_URL: it commits rows,
 * which stay in that throwaway database.
 */

const run = process.env.RUN_DB_TESTS === "1" && process.env.DIRECT_URL;
const skip = run ? false : "RUN_DB_TESTS=1 and DIRECT_URL are needed";
const VOLUNTEERS = 8;
const ROUNDS = 5;

let pool: pg.Pool;
const host = randomUUID();

before(async () => {
	if (!run) return;
	pool = new pg.Pool({
		connectionString: process.env.DIRECT_URL,
		max: VOLUNTEERS + 3,
	});
	await pool.query(
		"INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Host')",
		[host, `host-${host}@test.local`],
	);
});

after(async () => {
	await pool?.end();
});

/** An event with three open doors, doors on, and its volunteers. */
async function setup() {
	const eventId = randomUUID();
	await pool.query(
		"INSERT INTO events (id, host_user_id, slug, title) VALUES ($1, $2, $3, 'Doors')",
		[eventId, host, `doors-${eventId}`],
	);
	const doors: string[] = [];
	for (const name of ["Main gate", "VIP desk", "Side door"]) {
		const id = randomUUID();
		await pool.query(
			"INSERT INTO event_doors (id, event_id, name) VALUES ($1, $2, $3)",
			[id, eventId, name],
		);
		doors.push(id);
	}
	await pool.query("UPDATE events SET doors_enabled = true WHERE id = $1", [
		eventId,
	]);
	const members: string[] = [];
	for (let i = 0; i < VOLUNTEERS; i++) {
		const user = randomUUID();
		const member = randomUUID();
		await pool.query(
			"INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Vol')",
			[user, `vol-${user}@test.local`],
		);
		await pool.query(
			`INSERT INTO event_members (id, event_id, user_id, role, display_name, email, joined_at)
			 VALUES ($1, $2, $3, 'volunteer', 'Vol', $4, now())`,
			[member, eventId, user, `vol-${user}@test.local`],
		);
		members.push(member);
	}
	return { eventId, doors, members };
}

/**
 * One organizer's change and every volunteer's assignment, all at once,
 * each in its own transaction as the host at the second step. A refusal
 * (the rules) or a deadlock (the database choosing one) rolls back.
 */
async function race(change: string, args: unknown[], assigns: unknown[][]) {
	const clients = await Promise.all(
		Array.from({ length: assigns.length + 1 }, () => pool.connect()),
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
			}),
		);
		const work = (c: pg.PoolClient, sql: string, values: unknown[]) =>
			(async () => {
				try {
					await c.query(sql, values);
					await c.query("COMMIT");
				} catch (error) {
					await c.query("ROLLBACK");
					const code = (error as { code?: string }).code;
					if (code !== "23514" && code !== "40P01") throw error;
				}
			})();
		const [first, ...rest] = clients;
		assert.ok(first);
		await Promise.all([
			work(first, change, args),
			...rest.map((c, i) =>
				work(
					c,
					"INSERT INTO door_assignments (member_id, event_id, door_id) VALUES ($1, $2, $3)",
					assigns[i] ?? [],
				),
			),
		]);
	} finally {
		for (const c of clients) c.release();
	}
}

test("doors turned off while assigning: no one is left held", {
	skip,
}, async () => {
	for (let round = 0; round < ROUNDS; round++) {
		const { eventId, doors, members } = await setup();
		await race(
			"UPDATE events SET doors_enabled = false WHERE id = $1",
			[eventId],
			members.map((m) => [m, eventId, doors[0]]),
		);
		const { rows } = await pool.query<{ on: boolean; held: string }>(
			`SELECT e.doors_enabled AS on,
			   (SELECT count(*) FROM door_assignments a WHERE a.event_id = e.id) AS held
			 FROM events e WHERE e.id = $1`,
			[eventId],
		);
		const row = rows[0];
		assert.ok(row);
		if (!row.on) assert.equal(row.held, "0", `round ${round}`);
	}
});

test("a door retired while assigning to it: no one is held to it", {
	skip,
}, async () => {
	for (let round = 0; round < ROUNDS; round++) {
		const { eventId, doors, members } = await setup();
		const door = doors[0];
		await race(
			"UPDATE event_doors SET retired_at = now() WHERE id = $1",
			[door],
			members.map((m) => [m, eventId, door]),
		);
		const { rows } = await pool.query<{ retired: boolean; held: string }>(
			`SELECT d.retired_at IS NOT NULL AS retired,
			   (SELECT count(*) FROM door_assignments a WHERE a.door_id = d.id) AS held
			 FROM event_doors d WHERE d.id = $1`,
			[door],
		);
		const row = rows[0];
		assert.ok(row);
		if (row.retired) assert.equal(row.held, "0", `round ${round}`);
	}
});
