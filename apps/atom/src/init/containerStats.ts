import { readFileSync } from "node:fs";
import { join } from "node:path";

/** /health is polled, so the cgroup files are read at most this often per process. */
const STATS_READ_EVERY_MS = 1000;

/** cgroup v2 usage of the whole container; a limit is null when unset ("max") or unreadable. */
export type ContainerStats = {
	cpuUsageSeconds: number | null;
	cpuLimitCores: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
	processes: { pid: number; rssBytes: number }[];
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

const readCpuUsageSeconds = (cgroupDir: string): number | null => {
	const usage = readText(join(cgroupDir, "cpu.stat"))?.match(
		/^usage_usec (\d+)$/m,
	);
	return usage ? Number(usage[1]) / 1e6 : null;
};

const readCpuLimitCores = (cgroupDir: string): number | null => {
	const [quota, period] =
		readText(join(cgroupDir, "cpu.max"))?.split(" ") ?? [];
	if (!quota || quota === "max" || !period) return null;
	return Number(quota) / Number(period);
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
				? [{ pid: Number(pid), rssBytes: Number(rssKb[1]) * 1024 }]
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
		readAt = clock();
		stats = {
			cpuUsageSeconds: readCpuUsageSeconds(cgroupDir),
			cpuLimitCores: readCpuLimitCores(cgroupDir),
			memoryBytes: toBytes(readText(join(cgroupDir, "memory.current"))),
			memoryLimitBytes: toBytes(readText(join(cgroupDir, "memory.max"))),
			processes: readProcessRss({ cgroupDir, procDir }),
		};
		return stats;
	};
};
