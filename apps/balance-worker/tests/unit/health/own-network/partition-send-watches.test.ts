import { describe, expect, test } from "bun:test";
import { createPartitionSendWatches } from "../../../../src/health/ownNetwork/createPartitionSendWatches.js";

describe("partition send watches", () => {
	test("each partition reports its own longest send, and idle ones report nothing", async () => {
		const time = { now: 0 };
		const watches = createPartitionSendWatches({
			now: () => time.now,
			wallNow: () => 1_000_000 + time.now,
		});
		const stuck = Promise.withResolvers<void>();
		void watches.watchFor({ partition: 80 }).track(() => stuck.promise);
		await watches.watchFor({ partition: 81 }).track(async () => undefined);
		watches.watchFor({ partition: 82 });
		time.now = 1_500;
		expect(watches.take({ now: time.now })).toEqual([
			{ partition: 80, longestInFlightMs: 1_500 },
			{ partition: 81, longestInFlightMs: 0 },
		]);
		stuck.resolve();
	});

	test("the same partition shares one watch, and the age of the latest acknowledged send is kept on the monotonic clock", async () => {
		const time = { now: 0 };
		const watches = createPartitionSendWatches({ now: () => time.now });
		expect(watches.watchFor({ partition: 80 })).toBe(
			watches.watchFor({ partition: 80 }),
		);
		expect(watches.readLastAckAgeMs()).toBeNull();
		time.now = 400;
		await watches.watchFor({ partition: 80 }).track(async () => undefined);
		time.now = 900;
		await expect(
			watches.watchFor({ partition: 81 }).track(async () => {
				throw new Error("refused");
			}),
		).rejects.toThrow("refused");
		time.now = 1_000;
		expect(watches.readLastAckAgeMs()).toBe(600);
	});
});
