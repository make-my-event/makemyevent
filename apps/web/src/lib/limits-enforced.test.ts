import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Every server action and route asks a limit (CLAUDE.md: rate limiting on
 * every public write endpoint), or is listed here with why it needs none.
 * A new one without either fails this test.
 */
const NO_LIMIT: Record<string, string> = {
	"app/auth/signout/route.ts POST": "ends the caller's own session",
	"app/dashboard/[event]/guests/actions.ts getGuest": "a read",
	"app/dashboard/[event]/guests/guest-writes.ts guestFormValues": "a read",
	"app/dashboard/[event]/guests/passes.ts getPass": "a read",
	"app/dashboard/[event]/scan-qr/actions.ts doorCount": "a read",
	"app/dashboard/[event]/scan-qr/actions.ts scanPass": "asks in ready()",
	"app/dashboard/[event]/scan-qr/actions.ts scanCode": "asks in ready()",
	"app/dashboard/[event]/scan-qr/actions.ts checkInGuest": "asks in ready()",
	"app/dashboard/[event]/scan-qr/actions.ts doorGuests": "a read",
	"app/dashboard/[event]/scan-qr/doors-actions.ts setDoors": "asks in run()",
	"app/dashboard/[event]/scan-qr/doors-actions.ts addDoor": "asks in run()",
	"app/dashboard/[event]/scan-qr/doors-actions.ts renameDoor": "asks in run()",
	"app/dashboard/[event]/scan-qr/doors-actions.ts removeDoor": "asks in run()",
	"app/dashboard/[event]/scan-qr/doors-actions.ts assignDoor": "asks in run()",
	"app/dashboard/[event]/guests/actions.ts checkIn": "calls checkInMany",
	"app/api/events/[id]/media/route.ts POST": "asks in authorise()",
	"app/api/events/[id]/media/route.ts DELETE": "asks in authorise()",
	"app/account/(page)/security/actions.ts makeNewCodes": "asks in tooMany()",
	"app/account/(page)/security/actions.ts turnOff": "asks in tooMany()",
	"app/account/(page)/security/actions.ts signOutOthers": "asks in tooMany()",
	"app/dashboard/[event]/tickets/[ticket]/design/actions.ts saveDesign":
		"asks in prepare()",
	"app/dashboard/[event]/tickets/[ticket]/design/actions.ts applyDesignToAll":
		"asks in prepare()",
};

const root = fileURLToPath(new URL("..", import.meta.url));

test("every server action and route asks a limit", () => {
	const found = new Set<string>();
	const without: string[] = [];
	for (const entry of readdirSync(root, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
		const path = `${entry.parentPath}/${entry.name}`;
		const text = readFileSync(path, "utf8");
		const route = entry.name === "route.ts";
		if (!route && !/^\s*["']use server["']/m.test(text)) continue;
		// Each exported function, up to the next one.
		const parts = text.split(/^export (?:async )?(?:function|const) (?=\w)/m);
		for (const part of parts.slice(1)) {
			const name = /^\w+/.exec(part)?.[0] ?? "";
			if (route && !/^(GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(name)) continue;
			const id = `${relative(root, path)} ${name}`;
			found.add(id);
			if (!(id in NO_LIMIT) && !/\blimited\(/.test(part)) without.push(id);
		}
	}
	assert.deepEqual(without, []);
	assert.ok(found.size > 20, "the search found the endpoints");
	// An exception outlived its endpoint.
	for (const id of Object.keys(NO_LIMIT)) assert.ok(found.has(id), id);
	const scans = readFileSync(
		`${root}/app/dashboard/[event]/scan-qr/actions.ts`,
		"utf8",
	);
	assert.match(scans, /async function ready[\s\S]*?limited\("guest\.check_in"/);
	assert.equal(scans.match(/await ready\(/g)?.length, 3);
	const doors = readFileSync(
		`${root}/app/dashboard/[event]/scan-qr/doors-actions.ts`,
		"utf8",
	);
	assert.match(doors, /async function run[\s\S]*?limited\("event\.write"/);
	assert.equal(doors.match(/return run\(/g)?.length, 5);
	const designs = readFileSync(
		`${root}/app/dashboard/[event]/tickets/[ticket]/design/actions.ts`,
		"utf8",
	);
	assert.match(
		designs,
		/async function prepare[\s\S]*?limited\("event\.write"/,
	);
	assert.equal(designs.match(/await prepare\(/g)?.length, 2);
	const media = readFileSync(
		`${root}/app/api/events/[id]/media/route.ts`,
		"utf8",
	);
	assert.match(media, /async function authorise[\s\S]*?limited\(limit/);
	assert.equal(media.match(/await authorise\(/g)?.length, 2);
	const security = readFileSync(
		`${root}/app/account/(page)/security/actions.ts`,
		"utf8",
	);
	assert.match(security, /async function tooMany[\s\S]*?limited\(/);
	assert.equal(security.match(/await tooMany\(/g)?.length, 3);
});
