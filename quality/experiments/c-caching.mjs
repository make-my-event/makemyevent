/**
 * C. What does the per-request nonce actually cost?
 *
 * Three ways of serving the same pages, same payloads, same load:
 *
 *   dynamic         every response rendered by Next, fresh nonce each time.
 *                   This is what ships today.
 *   cache + rewrite  the HTML is rendered once and held; each response gets a
 *                   freshly generated nonce substituted into the body and the
 *                   CSP header before it is sent. This is the architecture a
 *                   CDN edge worker would run, prototyped in front of the
 *                   real app, and it is every bit as strict: no two visitors
 *                   are served the same nonce, and nothing is relaxed.
 *   cache, no rewrite  the cached body sent untouched. NOT a proposal: it
 *                   would hand every visitor the same nonce, which is close
 *                   to no nonce at all. It is here to separate the cost of
 *                   caching from the cost of rewriting.
 *
 * The app is not modified and the CSP is not weakened to produce a number.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sampleSystem } from "../resources.mjs";
import { startServer } from "../server.mjs";
import { probe } from "./run.mjs";

const NONCE_SLOT = "__MME_NONCE__";
const origin = await startServer({ port: 3260 });

/** One origin render per path, with its nonce turned into a slot. */
const cache = new Map();
async function fill(path) {
	const response = await fetch(origin.origin + path);
	const csp = response.headers.get("content-security-policy") ?? "";
	const body = await response.text();
	const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
	if (!nonce) throw new Error(`No nonce in the CSP for ${path}`);
	cache.set(path, {
		body: body.replaceAll(nonce, NONCE_SLOT),
		csp: csp.replaceAll(nonce, NONCE_SLOT),
		occurrences: body.split(nonce).length - 1,
	});
}
for (const path of ["/", "/about", "/signin"]) await fill(path);
console.log(
	"nonce occurrences per document:",
	[...cache].map(([p, v]) => `${p}=${v.occurrences}`).join(" "),
);

function proxy(rewrite) {
	return createServer((request, response) => {
		const entry = cache.get(request.url) ?? cache.get("/");
		let body = entry.body;
		let csp = entry.csp;
		if (rewrite) {
			const nonce = randomBytes(16).toString("hex");
			body = body.replaceAll(NONCE_SLOT, nonce);
			csp = csp.replaceAll(NONCE_SLOT, nonce);
		}
		const buffer = Buffer.from(body);
		response.writeHead(200, {
			"content-type": "text/html; charset=utf-8",
			"content-length": buffer.length,
			"content-security-policy": csp,
		});
		response.end(buffer);
	});
}

const rewriting = proxy(true);
const passthrough = proxy(false);
await new Promise((r) => rewriting.listen(3261, r));
await new Promise((r) => passthrough.listen(3262, r));

const configurations = [
	{ name: "dynamic (ships today)", base: origin.origin },
	{ name: "cache + nonce rewrite", base: "http://localhost:3261" },
	{ name: "cache, no rewrite", base: "http://localhost:3262" },
];

const rows = [];
for (const configuration of configurations) {
	const system = sampleSystem();
	const result = await probe({
		label: `c-${configuration.name}`,
		bases: [configuration.base],
		routes: ["/", "/about", "/signin"],
		vus: 50,
		duration: "25s",
	});
	rows.push({
		configuration: configuration.name,
		...result,
		...(await system.stop()),
	});
	console.log(`${configuration.name} done`);
	await new Promise((r) => setTimeout(r, 3000));
}

rewriting.close();
passthrough.close();
origin.stop();

const base = rows[0].rps;
for (const row of rows) row.vsDynamic = `${(row.rps / base).toFixed(1)}x`;

console.table(rows);
await writeFile(
	"quality/reports/experiments/c-caching.json",
	`${JSON.stringify({ experiment: "nonce cost: dynamic vs cached", vus: 50, rows }, null, 2)}\n`,
);
