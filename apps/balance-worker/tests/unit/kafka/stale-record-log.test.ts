import { describe, expect, test } from "bun:test";
import { createStaleRecordLog } from "../../../src/kafka/meteringConsumer/staleRecordLog.js";

describe("stale record log", () => {
	test("logs the first drop at once, folds a burst into the next line's count, and keeps partitions apart", () => {
		let clock = 1_000;
		const lines: unknown[][] = [];
		const log = createStaleRecordLog({
			logger: { warn: (...args: unknown[]) => lines.push(args) },
			now: () => clock,
			intervalMs: 1000,
		});
		const fence = { epoch: 7n, offset: 40n };
		const drop = (partition: number, offset: bigint) =>
			log.record({
				topic: "metering",
				partition,
				offset,
				ownerEpoch: 6n,
				fence,
			});

		drop(3, 41n);
		drop(3, 42n);
		drop(3, 43n);
		drop(9, 41n);
		expect(lines).toEqual([
			[
				"Stale owner record skipped",
				{
					topic: "metering",
					partition: 3,
					offset: "41",
					ownerEpoch: "6",
					fenceEpoch: "7",
					fenceOffset: "40",
					count: 1,
				},
			],
			[
				"Stale owner record skipped",
				expect.objectContaining({ partition: 9, offset: "41", count: 1 }),
			],
		]);

		clock += 1000;
		drop(3, 44n);
		expect(lines).toHaveLength(3);
		expect(lines[2]?.[1]).toEqual(
			expect.objectContaining({ partition: 3, offset: "44", count: 3 }),
		);
	});
});
