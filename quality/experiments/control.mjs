/**
 * Control: what can this machine measure at all?
 *
 * A bare Node server replays a captured copy of the landing page's HTML, so
 * the payload and the loopback path match the real test and the only thing
 * removed is React rendering. Whatever this reaches is the ceiling the load
 * generator and the box impose; no result from the other experiments can be
 * read as a property of the application above it.
 */
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { startServer } from "../server.mjs";
import { probe } from "./run.mjs";

const origin = await startServer({ port: 3240 });
const captured = {};
for (const route of ["/", "/about", "/signin"]) {
	captured[route] = Buffer.from(
		await (await fetch(origin.origin + route)).text(),
	);
}
origin.stop();

const replay = createServer((request, response) => {
	const body = captured[request.url] ?? captured["/"];
	response.writeHead(200, {
		"content-type": "text/html; charset=utf-8",
		"content-length": body.length,
	});
	response.end(body);
});
await new Promise((resolve) => replay.listen(3241, resolve));

const rows = [];
for (const vus of [25, 100]) {
	rows.push({
		vus,
		...(await probe({
			label: `control-${vus}`,
			bases: ["http://localhost:3241"],
			routes: ["/", "/about", "/signin"],
			vus,
		})),
	});
	console.log(`control at ${vus} VUs done`);
}
replay.close();

console.table(rows);
await writeFile(
	"quality/reports/experiments/control.json",
	`${JSON.stringify({ experiment: "measurement ceiling (no rendering)", rows }, null, 2)}\n`,
);
