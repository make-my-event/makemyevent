/**
 * Runs the k6 stages from perf-budgets.json against a production build and
 * writes one report.
 *
 *   node quality/load.mjs             # every stage
 *   node quality/load.mjs baseline    # one stage
 *
 * What this measures: one `next start` process on this machine. What it does
 * not measure: any CDN, edge cache, autoscaling or geography. The report says
 * so, because the number is an input to the hosting decision, not the answer.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { sampleResources } from "./resources.mjs";
import { startServer } from "./server.mjs";

const budgets = JSON.parse(await readFile("perf-budgets.json", "utf8"));
const only = process.argv[2];
const names = Object.keys(budgets.load.stages).filter(
	(n) => !n.startsWith("$"),
);
const stages = only ? names.filter((n) => n === only) : names;
if (stages.length === 0) {
	console.error(`Unknown stage "${only}". Known: ${names.join(", ")}`);
	process.exit(1);
}

const port = 3212;
const server = await startServer({ port });
await mkdir("quality/reports", { recursive: true });

const results = [];
for (const stage of stages) {
	console.log(`\n=== ${stage} ===`);
	const summaryPath = `quality/reports/k6-${stage}.json`;
	const resources = sampleResources(server.pid);

	const k6 = spawn(
		process.env.K6_PATH ?? "k6",
		[
			"run",
			"--quiet",
			"--summary-export",
			summaryPath,
			"-e",
			`STAGE=${stage}`,
			"-e",
			`BASE=${server.origin}`,
			"quality/k6/landing.js",
		],
		{ stdio: ["ignore", "inherit", "inherit"] },
	);
	const code = await new Promise((resolve) => k6.on("close", resolve));
	const usage = await resources.stop();

	const summary = JSON.parse(await readFile(summaryPath, "utf8"));
	const duration = summary.metrics.http_req_duration;
	const serverTime = summary.metrics.http_req_waiting;
	results.push({
		stage,
		// The stress stage runs without thresholds: it is meant to find the
		// cliff, so "met" would mean nothing there.
		thresholdsMet: stage === "stress" ? "n/a" : code === 0,
		requests: summary.metrics.http_reqs.count,
		rps: +summary.metrics.http_reqs.rate.toFixed(1),
		serverP50: +serverTime.med.toFixed(1),
		serverP95: +serverTime["p(95)"].toFixed(1),
		serverP99: +serverTime["p(99)"].toFixed(1),
		totalP50: +duration.med.toFixed(1),
		totalP95: +duration["p(95)"].toFixed(1),
		totalP99: +duration["p(99)"].toFixed(1),
		failedPct: +(summary.metrics.http_req_failed.value * 100).toFixed(3),
		bodyKbMedian: +(summary.metrics.response_body_bytes.med / 1024).toFixed(1),
		cpuPercentMedian: usage.cpuPercentMedian ?? null,
		cpuPercentMax: usage.cpuPercentMax ?? null,
		rssMbMax: usage.rssMbMax ?? null,
	});

	// Let the server settle so the next stage does not inherit a queue.
	await sleep(5000);
}

// Recovery: after the load stops, does a single request look normal again?
await sleep(3000);
const started = Date.now();
const recovery = await fetch(server.origin, {
	signal: AbortSignal.timeout(10000),
});
const recoveryMs = Date.now() - started;

server.stop();

const report = {
	measuredAt: new Date().toISOString(),
	note: "One `next start` process. No CDN, no edge cache, no autoscaling.",
	host: {
		platform: process.platform,
		cpus: (await import("node:os")).cpus().length,
	},
	thresholds: budgets.load.thresholds,
	enforce: budgets.enforce,
	stages: results,
	recovery: { status: recovery.status, ms: recoveryMs },
};
await writeFile(
	"quality/reports/load.json",
	`${JSON.stringify(report, null, 2)}\n`,
);

console.log("\n");
console.table(results);
console.log(`Recovery after load: ${recovery.status} in ${recoveryMs}ms`);
console.log("Report: quality/reports/load.json");

const breached = results
	.filter((r) => r.thresholdsMet === false)
	.map((r) => r.stage);
if (breached.length > 0) {
	console.log(
		budgets.enforce
			? `\nFAIL: thresholds breached in ${breached.join(", ")}.`
			: `\nThresholds breached in ${breached.join(", ")}; reported only, perf-budgets.json has enforce:false.`,
	);
	if (budgets.enforce) process.exit(1);
}
