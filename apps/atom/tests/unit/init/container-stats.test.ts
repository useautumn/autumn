import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContainerStatsReader } from "../../../src/init/containerStats.js";

const fakeContainer = ({
	cpuMax = "700000 100000",
	memoryMax = "12884901888",
}: {
	cpuMax?: string;
	memoryMax?: string;
} = {}) => {
	const root = mkdtempSync(join(tmpdir(), "atom-cgroup-"));
	const cgroupDir = join(root, "cgroup");
	const procDir = join(root, "proc");
	mkdirSync(cgroupDir);
	writeFileSync(
		join(cgroupDir, "cpu.stat"),
		"usage_usec 2500000\nuser_usec 2000000\nsystem_usec 500000\nnr_periods 40\nnr_throttled 3\nthrottled_usec 750000\n",
	);
	writeFileSync(join(cgroupDir, "cpu.max"), `${cpuMax}\n`);
	writeFileSync(join(cgroupDir, "memory.current"), "1073741824\n");
	writeFileSync(join(cgroupDir, "memory.max"), `${memoryMax}\n`);
	writeFileSync(join(cgroupDir, "cgroup.procs"), "1\n7\n");
	for (const [pid, rssKb, userTicks, systemTicks] of [
		["1", 2048, 150, 50],
		["7", 4096, 1200, 300],
	] as const) {
		mkdirSync(join(procDir, pid), { recursive: true });
		writeFileSync(
			join(procDir, pid, "status"),
			`Name:\tbun\nVmRSS:\t   ${rssKb} kB\nThreads:\t4\n`,
		);
		writeFileSync(
			join(procDir, pid, "stat"),
			`${pid} (bun (atom)) S 0 1 1 0 -1 4194560 100 0 0 0 ${userTicks} ${systemTicks} 0 0 20 0 4 0 100 0 0\n`,
		);
	}
	return { cgroupDir, procDir };
};

describe("container stats", () => {
	test("reports cgroup CPU and memory usage, and each process's own CPU, against the container's limits", () => {
		const readStats = createContainerStatsReader(fakeContainer());

		expect(readStats()).toEqual({
			cpuUsageSeconds: 2.5,
			cpuThrottledSeconds: 0.75,
			cpuLimitCores: 7,
			memoryBytes: 1073741824,
			memoryLimitBytes: 12884901888,
			processes: [
				{ pid: 1, rssBytes: 2048 * 1024, cpuSeconds: 2 },
				{ pid: 7, rssBytes: 4096 * 1024, cpuSeconds: 15 },
			],
		});
	});

	test("an unlimited container reports null limits", () => {
		const readStats = createContainerStatsReader(
			fakeContainer({ cpuMax: "max 100000", memoryMax: "max" }),
		);

		expect(readStats()).toMatchObject({
			cpuLimitCores: null,
			memoryLimitBytes: null,
		});
	});

	test("a host without cgroup files reports nulls instead of failing", () => {
		const missing = join(tmpdir(), "atom-cgroup-missing");
		const readStats = createContainerStatsReader({
			cgroupDir: missing,
			procDir: missing,
		});

		expect(readStats()).toEqual({
			cpuUsageSeconds: null,
			cpuThrottledSeconds: null,
			cpuLimitCores: null,
			memoryBytes: null,
			memoryLimitBytes: null,
			processes: [],
		});
	});

	test("the cgroup files are read at most once a second", () => {
		const container = fakeContainer();
		let now = 0;
		const readStats = createContainerStatsReader({
			...container,
			clock: () => now,
		});

		expect(readStats().memoryBytes).toBe(1073741824);
		writeFileSync(join(container.cgroupDir, "memory.current"), "2147483648\n");
		now = 999;
		expect(readStats().memoryBytes).toBe(1073741824);
		now = 1000;
		expect(readStats().memoryBytes).toBe(2147483648);
	});
});
