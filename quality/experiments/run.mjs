/**
 * Shared plumbing for the experiments: run the probe, collect the numbers.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";

export async function probe({
	label,
	bases,
	routes = ["/"],
	vus,
	duration = "30s",
}) {
	await mkdir("quality/reports/experiments", { recursive: true });
	const summaryPath = `quality/reports/experiments/${label.replace(/\W+/g, "-").replace(/-+$/, "")}.json`;
	const k6 = spawn(
		process.env.K6_PATH ?? "k6",
		[
			"run",
			"--quiet",
			"--summary-export",
			summaryPath,
			"-e",
			`BASES=${bases.join(",")}`,
			"-e",
			`ROUTES=${routes.join(",")}`,
			"-e",
			`VUS=${vus}`,
			"-e",
			`DURATION=${duration}`,
			"quality/experiments/k6/probe.js",
		],
		{ stdio: ["ignore", "ignore", "inherit"] },
	);
	const code = await new Promise((resolve) => k6.on("close", resolve));
	if (code !== 0) throw new Error(`k6 exited ${code} for ${label}`);

	const summary = JSON.parse(await readFile(summaryPath, "utf8"));
	const server = summary.metrics.http_req_waiting;
	const total = summary.metrics.http_req_duration;
	return {
		rps: +summary.metrics.http_reqs.rate.toFixed(1),
		serverP50: +server.med.toFixed(1),
		serverP95: +server["p(95)"].toFixed(1),
		serverP99: +server["p(99)"].toFixed(1),
		totalP95: +total["p(95)"].toFixed(1),
		failedPct: +(summary.metrics.http_req_failed.value * 100).toFixed(2),
	};
}
