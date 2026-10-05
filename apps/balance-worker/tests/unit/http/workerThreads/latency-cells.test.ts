import { expect, test } from "bun:test";
import {
	createLatencyCells,
	drainLatency,
	recordLatency,
} from "../../../../src/http/workerThreads/latency/latencyCells.js";

test("a window's percentiles land within a bucket of the true values, and a drain starts the next window", () => {
	const cells = new Int32Array(createLatencyCells({ routes: 2 }));
	for (let i = 1; i <= 1000; i++)
		recordLatency({ cells, route: 1, micros: i * 100 });
	const window = drainLatency({ cells, route: 1 });
	expect(window?.count).toBe(1000);
	expect(window?.max).toBe(100);
	// True p50 is 50 ms and p99 99 ms; a bucket is a fourth of a doubling wide.
	expect(window?.p50).toBeGreaterThanOrEqual(50);
	expect(window?.p50).toBeLessThan(50 * 2 ** 0.25);
	expect(window?.p99).toBeGreaterThanOrEqual(99);
	expect(window?.p99).toBeLessThan(99 * 2 ** 0.25);
	expect(drainLatency({ cells, route: 0 })).toBeNull();
	expect(drainLatency({ cells, route: 1 })).toBeNull();
});
