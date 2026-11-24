/**
 * Load test for the public pages, driven by perf-budgets.json.
 *
 * Every page here is rendered on demand: the per-request CSP nonce means no
 * HTML response can be reused, so this measures what one application server
 * costs per visitor. It is deliberately not a test of a CDN.
 *
 *   k6 run -e STAGE=baseline -e BASE=http://localhost:3212 quality/k6/landing.js
 */
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const budgets = JSON.parse(open("../../perf-budgets.json"));
const { routes, stages, thresholds } = budgets.load;

const STAGE = __ENV.STAGE || "baseline";
const BASE = __ENV.BASE || "http://localhost:3212";

const bodyBytes = new Trend("response_body_bytes");

function scenario() {
	const stage = stages[STAGE];
	if (!stage) throw new Error(`Unknown stage: ${STAGE}`);
	if (stage.ramp) {
		return {
			executor: "ramping-vus",
			startVUs: 0,
			stages: stage.ramp.map(({ target, duration }) => ({ target, duration })),
			gracefulRampDown: "10s",
		};
	}
	return {
		executor: "constant-vus",
		vus: stage.vus,
		duration: stage.duration,
	};
}

// The stress stage climbs until something gives, so a breach there is the
// point of the run rather than a failure of it.
const applyThresholds = STAGE !== "stress";

export const options = {
	scenarios: { [STAGE]: scenario() },
	summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
	discardResponseBodies: false,
	thresholds: applyThresholds
		? {
				// Server render time: the budget that gates.
				http_req_waiting: [
					`p(50)<${thresholds.server_p50}`,
					`p(95)<${thresholds.server_p95}`,
					`p(99)<${thresholds.server_p99}`,
				],
				// End to end, transfer included. Recorded, loosely bounded.
				http_req_duration: [`p(95)<${thresholds.total_p95}`],
				http_req_failed: [`rate<${thresholds.http_req_failed_rate}`],
			}
		: {},
};

export default function () {
	const route = routes[__ITER % routes.length];
	const response = http.get(BASE + route, {
		tags: { route },
		headers: { "accept-encoding": "br, gzip" },
	});
	bodyBytes.add(response.body ? response.body.length : 0, { route });
	check(response, {
		"status 200": (r) => r.status === 200,
		"has a document": (r) => r.body?.includes("</html>") === true,
	});
}
