import { describe, expect, test } from "bun:test";
import { readCpuCounters } from "../../../src/logging/eventLoopStalls/cpuCounters.js";

const PROC_STAT = `cpu  4705 150 1120 16250 520 30 45 90 7 0
cpu0 4705 150 1120 16250 520 30 45 90 7 0
intr 114930548 113199788 3 0 5 263 0 4
`;

function readerOf({ files }: { files: Record<string, string> }) {
	return ({ path }: { path: string }) => files[path] ?? null;
}

describe("cpu counters", () => {
	test("host steal and iowait come from the aggregate cpu line, guest time is not counted twice", () => {
		const counters = readCpuCounters({
			readFile: readerOf({ files: { "/proc/stat": PROC_STAT } }),
			processUsage: () => ({ user: 300, system: 200 }),
		});
		expect(counters).toEqual({
			processMicros: 500,
			host: { stealTicks: 90, iowaitTicks: 520, totalTicks: 22_910 },
			throttledMicros: null,
		});
	});

	test("throttling comes from cgroup v2, falling back to v1 in nanoseconds", () => {
		const v2 = readCpuCounters({
			readFile: readerOf({
				files: {
					"/sys/fs/cgroup/cpu.stat":
						"usage_usec 9000\nnr_throttled 3\nthrottled_usec 4200\n",
				},
			}),
			processUsage: () => ({ user: 0, system: 0 }),
		});
		expect(v2.throttledMicros).toBe(4_200);

		const v1 = readCpuCounters({
			readFile: readerOf({
				files: {
					"/sys/fs/cgroup/cpu/cpu.stat":
						"nr_periods 10\nnr_throttled 2\nthrottled_time 7000000\n",
				},
			}),
			processUsage: () => ({ user: 0, system: 0 }),
		});
		expect(v1.throttledMicros).toBe(7_000);
	});

	test("missing or unreadable files leave only the worker's own CPU time", () => {
		const counters = readCpuCounters({
			readFile: readerOf({
				files: { "/proc/stat": "garbage\n", "/sys/fs/cgroup/cpu.stat": "x" },
			}),
			processUsage: () => ({ user: 10, system: 5 }),
		});
		expect(counters).toEqual({
			processMicros: 15,
			host: null,
			throttledMicros: null,
		});
	});
});
