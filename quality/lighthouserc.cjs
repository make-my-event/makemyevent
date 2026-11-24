/**
 * Lighthouse CI. Every number comes from perf-budgets.json; nothing is
 * configured twice.
 *
 * Collection always runs against a production build served by `next start`
 * (quality/lighthouse.mjs starts it), on Lighthouse's simulated 4G mobile
 * profile, which is the condition CLAUDE.md names for the LCP budget.
 */
const budgets = require("../perf-budgets.json");

const level = budgets.enforce ? "error" : "warn";
const origin = process.env.QUALITY_ORIGIN ?? "http://localhost:3211";
const routes = Object.keys(budgets.lighthouse.routes);

const kb = (n) => n * 1024;

/** Budgets that are the same whatever the route. */
function sharedAssertions() {
	const assertions = {};
	for (const [category, minScore] of Object.entries(
		budgets.lighthouse.categories,
	)) {
		assertions[`categories:${category}`] = [level, { minScore }];
	}
	for (const [type, size] of Object.entries(
		budgets.lighthouse.resourceSizesKb,
	)) {
		if (type.startsWith("$")) continue;
		assertions[`resource-summary:${type}:size`] = [
			level,
			{ maxNumericValue: kb(size) },
		];
	}
	return assertions;
}

/** One matrix entry per route, so routes may diverge without a rewrite. */
const assertMatrix = routes.map((route) => {
	const metrics = budgets.lighthouse.routes[route];
	const assertions = sharedAssertions();
	for (const [metric, maxNumericValue] of Object.entries(metrics)) {
		if (metric === "name" || metric === "categories") continue;
		if (metric.startsWith("$")) continue;
		assertions[metric] = [level, { maxNumericValue }];
	}
	// A route may lower a category score deliberately; sign-in is noindex.
	for (const [category, minScore] of Object.entries(metrics.categories ?? {})) {
		if (category.startsWith("$")) continue;
		assertions[`categories:${category}`] = [level, { minScore }];
	}
	return {
		// No preset: a preset asserts its own several hundred audits on top of
		// these, and a budget nobody chose is noise. Every assertion here comes
		// from perf-budgets.json.
		matchingUrlPattern: `${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${route === "/" ? "/$" : route}`,
		assertions,
	};
});

module.exports = {
	ci: {
		collect: {
			url: routes.map((route) => origin + route),
			numberOfRuns: budgets.lighthouse.runs,
			settings: {
				formFactor: budgets.lighthouse.formFactor,
				// Lighthouse's own simulated 4G, the condition the LCP budget names.
				throttlingMethod: "simulate",
				screenEmulation: {
					mobile: true,
					width: 390,
					height: 844,
					deviceScaleFactor: 3,
				},
				skipAudits: ["uses-http2", "canonical"],
			},
		},
		assert: { assertMatrix },
		upload: { target: "filesystem", outputDir: "quality/reports/lighthouse" },
	},
};
