import { describe, expect, test } from "bun:test";
import {
	cpuWindowOf,
	readCpuCounters,
} from "../../../src/logging/eventLoopStalls/cpuCounters.js";

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
			mainThreadMicros: null,
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
			mainThreadMicros: null,
		});
	});

	test("the decide thread's own CPU comes from its task stat, apart from GC helpers and other threads", () => {
		const taskStat = `${process.pid} (bun (main)) R 1 2 3 0 -1 4194560 100 0 0 0 250 70 0 0 20 0 9 0 5 1 1`;
		const read = (mainTicks: string) =>
			readCpuCounters({
				readFile: readerOf({
					files: { [`/proc/self/task/${process.pid}/stat`]: mainTicks },
				}),
				processUsage: () => ({ user: 0, system: 0 }),
			});
		const previous = read(taskStat);
		expect(previous.mainThreadMicros).toBe(3_200_000);
		const current = read(taskStat.replace(" 250 70 ", " 650 70 "));
		expect(
			cpuWindowOf({ previous, current, windowMs: 10_000 }).mainCpuPct,
		).toBe(40);
	});
});
