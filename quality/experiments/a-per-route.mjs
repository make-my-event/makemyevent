/**
 * A. Is one route unusually expensive, or do they all hit the same ceiling?
 *
 * The combined load test mixes three routes, so a single costly page would
 * hide inside the average. Each is driven on its own here, at the same
 * concurrency, against one server.
 */
import { writeFile } from "node:fs/promises";
import { sampleResources } from "../resources.mjs";
import { startServer } from "../server.mjs";
import { probe } from "./run.mjs";

const server = await startServer({ port: 3220 });
const rows = [];

for (const route of ["/", "/about", "/signin"]) {
	const resources = sampleResources(server.pid);
	const result = await probe({
		label: `a-route${route.replace("/", "-") || "-root"}`,
		bases: [server.origin],
		routes: [route],
		vus: 25,
	});
	const usage = await resources.stop();
	const bytes = (await (await fetch(server.origin + route)).text()).length;
	rows.push({
		route,
		htmlKb: +(bytes / 1024).toFixed(1),
		...result,
		cpuPercentMedian: usage.cpuPercentMedian ?? null,
	});
	console.log(`${route} done`);
}

server.stop();
console.table(rows);
await writeFile(
	"quality/reports/experiments/a-per-route.json",
	`${JSON.stringify({ experiment: "per-route cost", vus: 25, rows }, null, 2)}\n`,
);
