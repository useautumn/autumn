import { describe, expect, test } from "bun:test";
import { readAtomHealth } from "../../../src/init/atomHealth.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";

describe("Atom health", () => {
	test("every thread reports the main thread's boot, how many threads it has replaced, and each thread's counters", () => {
		const restarts = new Int32Array(new SharedArrayBuffer(4));
		const threadStats = createThreadStatsBuffer({ threads: 2 });
		const health = {
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts,
			threadStats,
		};
		const thread1 = openThreadCounters({ buffer: threadStats, index: 1 });
		thread1.add("checks");
		thread1.add("checks", 2);
		thread1.set("heldBytes", 4096);
		Atomics.add(restarts, 0, 2);

		expect(readAtomHealth(health)).toMatchObject({
			status: "alive",
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts: 2,
			container: expect.any(Object),
			threads: [
				{ index: 0, checks: 0, heldBytes: 0 },
				{ index: 1, checks: 3, heldBytes: 4096 },
			],
		});
	});
});
