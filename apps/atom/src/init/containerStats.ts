import { readFileSync } from "node:fs";

/** cgroup v2 usage of the whole container; a limit is null when unset ("max") or unreadable. */
export type ContainerStats = {
	cpuUsageSeconds: number | null;
	cpuLimitCores: number | null;
	memoryBytes: number | null;
	memoryLimitBytes: number | null;
};

const CGROUP_DIR = "/sys/fs/cgroup";
/** /health is polled, so the cgroup files are read at most this often per thread. */
const READ_EVERY_MS = 1000;

const readText = (path: string): string | null => {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return null;
	}
};

const toBytes = (text: string | null): number | null =>
	text === null || text === "max" ? null : Number(text);

const readCpuUsageSeconds = ({ cgroupDir }: { cgroupDir: string }) => {
	const usage = readText(`${cgroupDir}/cpu.stat`)?.match(/^usage_usec (\d+)$/m);
	return usage ? Number(usage[1]) / 1e6 : null;
};

const readCpuLimitCores = ({ cgroupDir }: { cgroupDir: string }) => {
	const [quota, period] = readText(`${cgroupDir}/cpu.max`)?.split(" ") ?? [];
	if (!quota || quota === "max" || !period) return null;
	return Number(quota) / Number(period);
};

export const readContainerStatsFrom = ({
	cgroupDir,
}: {
	cgroupDir: string;
}): ContainerStats => ({
	cpuUsageSeconds: readCpuUsageSeconds({ cgroupDir }),
	cpuLimitCores: readCpuLimitCores({ cgroupDir }),
	memoryBytes: toBytes(readText(`${cgroupDir}/memory.current`)),
	memoryLimitBytes: toBytes(readText(`${cgroupDir}/memory.max`)),
});

let cached: { at: number; stats: ContainerStats } | undefined;

export const readContainerStats = (): ContainerStats => {
	if (cached && performance.now() - cached.at < READ_EVERY_MS)
		return cached.stats;
	cached = {
		at: performance.now(),
		stats: readContainerStatsFrom({ cgroupDir: CGROUP_DIR }),
	};
	return cached.stats;
};
