import { readFileSync } from "node:fs";
import { join } from "node:path";

/** /health is polled, so the cgroup files are read at most this often per thread. */
const STATS_READ_EVERY_MS = 1000;

/** cgroup v2 usage of the whole container; a limit is null when unset ("max") or unreadable. */
export type ContainerStats = {
	cpuUsageSeconds: number | null;
	/** Cores the whole container used since the previous read; null on the first. */
	cpuCores: number | null;
	/** Cumulative time the CPU limit held the container back: rising at below-limit usage means bursts hit the quota. */
	cpuThrottledSeconds: number | null;
	cpuLimitCores: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
	/** cpuSeconds is the process's own user + system time since it started, every thread's included. */
	processes: { pid: number; rssBytes: number; cpuSeconds: number | null }[];
};

const readText = (path: string): string | null => {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return null;
	}
};

const toBytes = (text: string | null): number | null =>
	text === null || text === "max" ? null : Number(text);

const readCpuStatSeconds = ({
	cpuStat,
	field,
}: {
	cpuStat: string | null;
	field: "usage_usec" | "throttled_usec";
}): number | null => {
	const value = cpuStat?.match(new RegExp(`^${field} (\\d+)$`, "m"));
	return value ? Number(value[1]) / 1e6 : null;
};

const readCpuLimitCores = (cgroupDir: string): number | null => {
	const [quota, period] =
		readText(join(cgroupDir, "cpu.max"))?.split(" ") ?? [];
	if (!quota || quota === "max" || !period) return null;
	return Number(quota) / Number(period);
};

/** Linux counts in clock ticks of 1/100 s; fields 14 and 15 of stat, after the parenthesised name. */
const CLOCK_TICKS_PER_SECOND = 100;

const readProcessCpuSeconds = ({
	procDir,
	pid,
}: {
	procDir: string;
	pid: string;
}): number | null => {
	const stat = readText(join(procDir, pid, "stat"));
	const fields = stat?.slice(stat.lastIndexOf(")") + 2).split(" ");
	const user = Number(fields?.[11]);
	const system = Number(fields?.[12]);
	if (!Number.isFinite(user) || !Number.isFinite(system)) return null;
	return (user + system) / CLOCK_TICKS_PER_SECOND;
};

const readProcessRss = ({
	cgroupDir,
	procDir,
}: {
	cgroupDir: string;
	procDir: string;
}): ContainerStats["processes"] =>
	(readText(join(cgroupDir, "cgroup.procs"))?.split("\n") ?? []).flatMap(
		(pid) => {
			const rssKb = readText(join(procDir, pid, "status"))?.match(
				/^VmRSS:\s+(\d+) kB$/m,
			);
			return rssKb
				? [
						{
							pid: Number(pid),
							rssBytes: Number(rssKb[1]) * 1024,
							cpuSeconds: readProcessCpuSeconds({ procDir, pid }),
						},
					]
				: [];
		},
	);

export const createContainerStatsReader = ({
	cgroupDir = "/sys/fs/cgroup",
	procDir = "/proc",
	clock = () => performance.now(),
}: {
	cgroupDir?: string;
	procDir?: string;
	clock?: () => number;
} = {}): (() => ContainerStats) => {
	let stats: ContainerStats | null = null;
	let readAt = Number.NEGATIVE_INFINITY;

	return () => {
		if (stats && clock() - readAt < STATS_READ_EVERY_MS) return stats;
		const previous = stats ? { readAt, usage: stats.cpuUsageSeconds } : null;
		readAt = clock();
		const cpuStat = readText(join(cgroupDir, "cpu.stat"));
		const cpuUsageSeconds = readCpuStatSeconds({
			cpuStat,
			field: "usage_usec",
		});
		stats = {
			cpuUsageSeconds,
			cpuCores:
				previous?.usage != null && cpuUsageSeconds !== null
					? (cpuUsageSeconds - previous.usage) /
						((readAt - previous.readAt) / 1000)
					: null,
			cpuThrottledSeconds: readCpuStatSeconds({
				cpuStat,
				field: "throttled_usec",
			}),
			cpuLimitCores: readCpuLimitCores(cgroupDir),
			memoryBytes: toBytes(readText(join(cgroupDir, "memory.current"))),
			memoryLimitBytes: toBytes(readText(join(cgroupDir, "memory.max"))),
			processes: readProcessRss({ cgroupDir, procDir }),
		};
		return stats;
	};
};
