import { describe, expect, test } from "bun:test";
import { readAtomHealth } from "../../../src/init/atomHealth.js";

describe("Atom health", () => {
	test("every thread reports the main thread's boot and how many threads it has replaced", () => {
		const restarts = new Int32Array(new SharedArrayBuffer(4));
		const health = { bootedAt: "2026-10-05T21:00:00.000Z", restarts };

		expect(readAtomHealth(health)).toEqual({
			status: "alive",
			bootedAt: "2026-10-05T21:00:00.000Z",
			restarts: 0,
		});
		Atomics.add(restarts, 0, 2);
		expect(readAtomHealth(health).restarts).toBe(2);
	});
});
