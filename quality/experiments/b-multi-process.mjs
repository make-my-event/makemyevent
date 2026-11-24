/**
 * B. Does the workload scale across processes?
 *
 * One `next start` is one Node process and cannot use a second core, so the
 * question is whether capacity simply multiplies. Load is spread across the
 * origins by the client rather than through a proxy: a reverse proxy on the
 * same four cores would become the thing being measured.
 *
 * This machine has four cores and k6 needs some of them, so the fourth
 * process has nowhere to run. Read the shape, not the absolute numbers.
 */
import { writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { sampleResources, sampleSystem } from "../resources.mjs";
import { startServer } from "../server.mjs";
import { probe } from "./run.mjs";

const rows = [];
for (const count of [1, 2, 4]) {
	const servers = [];
	for (let index = 0; index < count; index++) {
		servers.push(await startServer({ port: 3230 + index }));
	}
	const system = sampleSystem();
	const perProcess = servers.map((server) => sampleResources(server.pid));
	const result = await probe({
		label: `b-processes-${count}`,
		bases: servers.map((s) => s.origin),
		routes: ["/", "/about", "/signin"],
		vus: 100,
		duration: "25s",
	});
	const machine = await system.stop();
	let serversCpuPercent = 0;
	for (const sampler of perProcess) {
		serversCpuPercent += (await sampler.stop()).cpuPercentMedian ?? 0;
	}
	for (const server of servers) server.stop();
	rows.push({
		processes: count,
		...result,
		rpsPerProcess: +(result.rps / count).toFixed(1),
		serversCpuPercent: +serversCpuPercent.toFixed(1),
		...machine,
	});
	console.log(`${count} process(es) done`);
	await new Promise((resolve) => setTimeout(resolve, 4000));
}

const base = rows[0].rps;
for (const row of rows) row.scaling = `${(row.rps / base).toFixed(2)}x`;

console.table(rows);
await writeFile(
	"quality/reports/experiments/b-multi-process.json",
	`${JSON.stringify({ experiment: "multi-process scaling", cores: cpus().length, vus: 100, rows }, null, 2)}\n`,
);
