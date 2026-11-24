/**
 * Runs Lighthouse CI against a production build.
 *
 *   node quality/lighthouse.mjs
 *
 * Budgets live in perf-budgets.json and are breaches-reported-only until
 * that file sets enforce:true.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromePath } from "./chrome.mjs";
import { startServer } from "./server.mjs";

const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8"));
const port = 3211;
const server = await startServer({ port });

const lhci = spawn(
	"pnpm",
	["exec", "lhci", "autorun", "--config=quality/lighthouserc.cjs"],
	{
		stdio: "inherit",
		env: {
			...process.env,
			QUALITY_ORIGIN: server.origin,
			CHROME_PATH: chromePath(),
		},
	},
);

const code = await new Promise((resolve) => lhci.on("close", resolve));
server.stop();

if (code !== 0 && !budgets.enforce) {
	console.log(
		"\nBudgets were breached. perf-budgets.json has enforce:false, so this is a report, not a failure.",
	);
	process.exit(0);
}
process.exit(code);
