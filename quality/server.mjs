import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * The build these measurements run against, kept apart from `.next`.
 *
 * A dev server owns `.next` while it runs, and a production build written
 * over the top of it leaves it answering 500 on every route until it is
 * restarted. next.config.mjs reads NEXT_DIST_DIR for exactly this reason;
 * nothing here may ignore it.
 */
export const QUALITY_DIST_DIR = ".next-quality";

/** Builds into QUALITY_DIST_DIR if it is not there already. */
async function ensureBuild(distDir) {
	if (existsSync(`apps/web/${distDir}/BUILD_ID`)) return;
	console.log(`Building into apps/web/${distDir} ...`);
	const build = spawn("pnpm", ["--filter", "@makemyevent/web", "build"], {
		env: { ...process.env, NEXT_DIST_DIR: distDir },
		stdio: ["ignore", "ignore", "inherit"],
	});
	const code = await new Promise((resolve) => build.on("close", resolve));
	if (code !== 0) throw new Error(`Build failed with code ${code}`);
}

/**
 * Starts the built web app and waits for it to answer.
 *
 * Every measurement in this folder runs against `next start`, never `next
 * dev`: the dev server recompiles on demand, ships unminified code and has no
 * production caching, so its numbers mean nothing.
 */
export async function startServer({
	port = 3210,
	distDir = QUALITY_DIST_DIR,
} = {}) {
	await ensureBuild(distDir);
	const child = spawn("pnpm", ["--filter", "@makemyevent/web", "start"], {
		env: {
			...process.env,
			PORT: String(port),
			NEXT_DIST_DIR: distDir,
			NODE_ENV: "production",
			NEXT_PUBLIC_SUPABASE_URL:
				process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co",
			NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
				process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
				"sb_publishable_placeholder_for_measurement",
			NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
		},
		stdio: ["ignore", "pipe", "pipe"],
		// Its own process group: `next start` runs under a pnpm wrapper, and
		// killing the wrapper leaves the server holding the port and this
		// script's event loop open. The group is killed as a whole below.
		detached: true,
	});

	let log = "";
	child.stdout.on("data", (d) => {
		log += d;
	});
	child.stderr.on("data", (d) => {
		log += d;
	});

	const stop = () => {
		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {
			// Already gone.
		}
	};

	const origin = `http://localhost:${port}`;
	for (let attempt = 0; attempt < 60; attempt++) {
		await sleep(500);
		if (child.exitCode !== null) {
			throw new Error(`Server exited early:\n${log}`);
		}
		try {
			const response = await fetch(origin, {
				signal: AbortSignal.timeout(2000),
			});
			if (response.ok) return { origin, pid: child.pid, stop };
		} catch {
			// Not up yet.
		}
	}
	stop();
	throw new Error(`Server did not answer within 30s:\n${log}`);
}
