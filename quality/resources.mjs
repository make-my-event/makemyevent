import { readFile, readdir } from "node:fs/promises";

/**
 * Samples CPU and memory for a process and everything it spawned.
 *
 * k6 reports what the client saw; this reports what it cost the server, which
 * is the number the hosting decision actually turns on. Linux only — nothing
 * else is sampled, and the report says so rather than guessing.
 */
const CLOCK_TICKS = 100;

async function tree(rootPid) {
	const entries = await readdir("/proc");
	const parents = new Map();
	for (const entry of entries) {
		if (!/^\d+$/.test(entry)) continue;
		try {
			const stat = await readFile(`/proc/${entry}/stat`, "utf8");
			const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			parents.set(Number(entry), Number(after[1]));
		} catch {
			// The process went away between readdir and read.
		}
	}
	const members = [];
	for (const pid of parents.keys()) {
		let cursor = pid;
		for (let depth = 0; depth < 20 && cursor > 1; depth++) {
			if (cursor === rootPid) {
				members.push(pid);
				break;
			}
			cursor = parents.get(cursor) ?? 0;
		}
	}
	return members;
}

async function snapshot(rootPid) {
	let cpuTicks = 0;
	let rssPages = 0;
	for (const pid of await tree(rootPid)) {
		try {
			const stat = await readFile(`/proc/${pid}/stat`, "utf8");
			const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
			// utime, stime, rss: fields 14, 15 and 24 of proc(5), zero-indexed here.
			cpuTicks += Number(after[11]) + Number(after[12]);
			rssPages += Number(after[21]);
		} catch {
			// Gone; it contributed what it contributed.
		}
	}
	return { cpuTicks, rssMb: (rssPages * 4096) / 1024 / 1024, at: Date.now() };
}

export function sampleResources(rootPid, intervalMs = 500) {
	if (process.platform !== "linux") {
		return { stop: async () => ({ supported: false }) };
	}
	const samples = [];
	let previous = null;
	const timer = setInterval(async () => {
		const now = await snapshot(rootPid);
		if (previous) {
			const seconds = (now.at - previous.at) / 1000;
			const cpuPercent =
				((now.cpuTicks - previous.cpuTicks) / CLOCK_TICKS / seconds) * 100;
			samples.push({ cpuPercent, rssMb: now.rssMb });
		}
		previous = now;
	}, intervalMs);

	return {
		async stop() {
			clearInterval(timer);
			if (samples.length === 0) return { supported: true, samples: 0 };
			const cpu = samples.map((s) => s.cpuPercent).sort((a, b) => a - b);
			const rss = samples.map((s) => s.rssMb).sort((a, b) => a - b);
			const at = (list, q) =>
				list[Math.min(list.length - 1, Math.floor(list.length * q))];
			return {
				supported: true,
				samples: samples.length,
				cpuPercentMedian: +at(cpu, 0.5).toFixed(1),
				cpuPercentP95: +at(cpu, 0.95).toFixed(1),
				cpuPercentMax: +cpu[cpu.length - 1].toFixed(1),
				rssMbMedian: +at(rss, 0.5).toFixed(1),
				rssMbMax: +rss[rss.length - 1].toFixed(1),
			};
		},
	};
}
