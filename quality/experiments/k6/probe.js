/**
 * A plain throughput probe, for the experiments in quality/experiments.
 *
 * Unlike quality/k6/landing.js it carries no budgets: these runs exist to
 * compare one configuration against another, so a pass/fail would only get in
 * the way. ROUTES and BASES are comma-separated; BASES with more than one
 * entry spreads load across several origins, which is how the multi-process
 * experiment avoids measuring a proxy instead of the servers.
 */
import http from "k6/http";
import { check } from "k6";

const ROUTES = (__ENV.ROUTES || "/").split(",");
const BASES = (__ENV.BASES || "http://localhost:3212").split(",");

export const options = {
	scenarios: {
		probe: {
			executor: "constant-vus",
			vus: Number(__ENV.VUS || 25),
			duration: __ENV.DURATION || "30s",
		},
	},
	summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
};

export default function () {
	const base = BASES[__VU % BASES.length];
	const route = ROUTES[__ITER % ROUTES.length];
	const response = http.get(base + route, { tags: { route } });
	check(response, { "status 200": (r) => r.status === 200 });
}
