import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { readAtomHealth } from "../../../src/init/atomHealth.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";

const healthOf = ({ threads }: { threads: number }) => ({
	bootedAt: "2026-10-05T21:00:00.000Z",
	restarts: new Int32Array(new SharedArrayBuffer(4)),
	ready: new Int32Array(new SharedArrayBuffer(4)),
	threadsReady: new Int32Array(new SharedArrayBuffer(4 * threads)),
	threadStats: createThreadStatsBuffer({ threads }),
	dataDir: tmpdir(),
});

describe("Atom health", () => {
	test("every thread reports the main thread's boot, how many threads it has replaced, and each thread's counters", () => {
		const health = healthOf({ threads: 2 });
		Atomics.store(health.ready, 0, 1);
		Atomics.store(health.threadsReady, 0, 1);
		Atomics.store(health.threadsReady, 1, 1);
		const thread1 = openThreadCounters({
			buffer: health.threadStats,
			index: 1,
		});
		thread1.add("checks");
		thread1.add("checks", 2);
		thread1.set("heldBytes", 4096);
		Atomics.add(health.restarts, 0, 2);

		expect(readAtomHealth(health)).toMatchObject({
			status: "alive",
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts: 2,
			container: expect.any(Object),
			threads: [
				{ index: 0, checks: 0, heldBytes: 0, ready: true },
				{ index: 1, checks: 3, heldBytes: 4096, ready: true },
			],
		});
	});

	test("starting until every thread has started once; a thread replaced after that leaves the replica degraded, not starting", () => {
		const health = healthOf({ threads: 2 });
		Atomics.store(health.threadsReady, 0, 1);
		expect(readAtomHealth(health).status).toBe("starting");

		Atomics.store(health.threadsReady, 1, 1);
		Atomics.store(health.ready, 0, 1);
		expect(readAtomHealth(health).status).toBe("alive");

		Atomics.store(health.threadsReady, 1, 0);
		const degraded = readAtomHealth(health);
		expect(degraded.status).toBe("degraded");
		expect(degraded.threads.map(({ ready }) => ready)).toEqual([true, false]);
	});
});
