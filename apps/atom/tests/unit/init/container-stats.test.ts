import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readContainerStatsFrom } from "../../../src/init/containerStats.js";

const fakeCgroup = ({
	cpuMax,
	memoryMax,
}: {
	cpuMax: string;
	memoryMax: string;
}) => {
	const cgroupDir = mkdtempSync(join(tmpdir(), "atom-cgroup-"));
	writeFileSync(
		join(cgroupDir, "cpu.stat"),
		"usage_usec 2500000\nuser_usec 2000000\n",
	);
	writeFileSync(join(cgroupDir, "cpu.max"), `${cpuMax}\n`);
	writeFileSync(join(cgroupDir, "memory.current"), "1073741824\n");
	writeFileSync(join(cgroupDir, "memory.max"), `${memoryMax}\n`);
	return cgroupDir;
};

describe("container stats", () => {
	test("reads the cgroup's CPU and memory usage against its limits", () => {
		const cgroupDir = fakeCgroup({
			cpuMax: "700000 100000",
			memoryMax: "12884901888",
		});

		expect(readContainerStatsFrom({ cgroupDir })).toEqual({
			cpuUsageSeconds: 2.5,
			cpuLimitCores: 7,
			memoryBytes: 1073741824,
			memoryLimitBytes: 12884901888,
		});
	});

	test("an unset limit, or a machine with no cgroup files, reads as null", () => {
		const cgroupDir = fakeCgroup({ cpuMax: "max 100000", memoryMax: "max" });

		expect(readContainerStatsFrom({ cgroupDir })).toMatchObject({
			cpuLimitCores: null,
			memoryLimitBytes: null,
		});
		expect(readContainerStatsFrom({ cgroupDir: "/nowhere" })).toEqual({
			cpuUsageSeconds: null,
			cpuLimitCores: null,
			memoryBytes: null,
			memoryLimitBytes: null,
		});
	});
});
