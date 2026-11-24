/**
 * Automated WCAG pass. CLAUDE.md puts the floor at WCAG 2.2 AA, so every
 * route is scanned in both themes and at both widths, and the one state a
 * visitor can reach without data — the mobile menu — is scanned open as well.
 *
 * Automation catches perhaps a third of real barriers. The manual
 * screen-reader pass each stage still has to happen; this only stops the
 * regressions a machine can see.
 *
 *   node quality/a11y.mjs [--url http://localhost:3210] [--enforce]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { AxePuppeteer } from "@axe-core/puppeteer";
import puppeteer from "puppeteer-core";
import { chromePath } from "./chrome.mjs";
import { startServer } from "./server.mjs";

const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8"));
const { standard, themes, viewports, maxViolations } = budgets.accessibility;
const routes = Object.keys(budgets.lighthouse.routes);

const args = process.argv.slice(2);
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
const enforce = args.includes("--enforce") || budgets.enforce === true;

const server = urlArg ? null : await startServer({ port: 3210 });
const origin = urlArg ?? server.origin;

const browser = await puppeteer.launch({
	executablePath: chromePath(),
	headless: "new",
	args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const findings = [];

async function scan({ route, theme, viewport, state = "default", prepare }) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.setViewport({ width: viewport.width, height: viewport.height });
	await page.evaluateOnNewDocument(
		(t) => localStorage.setItem("makemyevent-theme", t),
		theme,
	);
	await page.goto(origin + route, { waitUntil: "networkidle0" });
	if (prepare) await prepare(page);

	const results = await new AxePuppeteer(page).withTags(standard).analyze();
	for (const violation of results.violations) {
		findings.push({
			route,
			theme,
			viewport: viewport.name,
			state,
			id: violation.id,
			impact: violation.impact,
			help: violation.help,
			nodes: violation.nodes.length,
			target: violation.nodes[0]?.target?.join(" ") ?? "",
		});
	}
	await page.close();
	await context.close();
	return results.violations.length;
}

let checks = 0;
for (const route of routes) {
	for (const theme of themes) {
		for (const viewport of viewports) {
			await scan({ route, theme, viewport });
			checks++;
		}
	}
}

// The mobile menu is the only route to primary navigation below 1024px, so it
// is scanned open, in both themes.
for (const theme of themes) {
	await scan({
		route: "/",
		theme,
		viewport: viewports.find((v) => v.name === "mobile") ?? viewports[0],
		state: "menu open",
		prepare: async (page) => {
			await page.click('header button[aria-expanded="false"]');
			await page.waitForSelector('header button[aria-expanded="true"]');
		},
	});
	checks++;
}

await browser.close();
server?.stop();

await mkdir("quality/reports", { recursive: true });
await writeFile(
	"quality/reports/a11y.json",
	`${JSON.stringify({ origin, standard, checks, findings }, null, 2)}\n`,
);

console.log(`\naxe: ${checks} scans across ${routes.length} routes.`);
if (findings.length === 0) {
	console.log("No violations.");
} else {
	console.table(findings);
}
console.log("Report: quality/reports/a11y.json");

if (findings.length > maxViolations) {
	console.log(
		enforce
			? `\nFAIL: ${findings.length} violations, budget is ${maxViolations}.`
			: `\nOver budget (${findings.length} > ${maxViolations}), reported only: perf-budgets.json has enforce:false.`,
	);
	if (enforce) process.exit(1);
}
