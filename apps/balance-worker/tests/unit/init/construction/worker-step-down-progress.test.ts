import { describe, expect, test } from "bun:test";
import { readFleetProgressWithin } from "../../../../src/init/construction/createWorkerStepDown.js";
import type { FleetProgress } from "../../../../src/health/stepDown/types/fleetProgress.js";

const EMPTY: FleetProgress = { highWatermarks: new Map(), nextOffsets: new Map() };

describe("bounded fleet progress reads", () => {
	test("a read that outlasts its bound fails that poll, and the next poll joins it instead of starting another", async () => {
		const slow = Promise.withResolvers<FleetProgress>();
		const started = { reads: 0 };
		const read = readFleetProgressWithin({
			read: () => {
				started.reads += 1;
				return slow.promise;
			},
			timeoutMs: 20,
		});
		await expect(read()).rejects.toThrow("took longer than 20 ms");
		const second = read();
		expect(started.reads).toBe(1);
		slow.resolve(EMPTY);
		expect(await second).toBe(EMPTY);
		await read();
		expect(started.reads).toBe(2);
	});
});
