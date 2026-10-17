import { describe, expect, test } from "bun:test";
import { createPartitionSendWatches } from "../../../../src/health/ownNetwork/createPartitionSendWatches.js";

function always(): boolean {
	return true;
}

describe("partition send watches", () => {
	test("each held partition reports its longest send under its holding, and idle ones report nothing", async () => {
		const time = { now: 0 };
		const watches = createPartitionSendWatches({
			ctx: { now: () => time.now, holdingOf: () => 1 },
		});
		const stuck = Promise.withResolvers<void>();
		void watches.watchFor({ partition: 80 }).track(() => stuck.promise);
		await watches.watchFor({ partition: 81 }).track(async () => undefined);
		watches.watchFor({ partition: 82 });
		time.now = 1_500;
		expect(watches.take({ now: time.now, isCurrent: always })).toEqual([
			{ partition: 80, holding: 1, longestInFlightMs: 1_500 },
			{ partition: 81, holding: 1, longestInFlightMs: 0 },
		]);
		stuck.resolve();
	});

	test("a send stays with the holding it started under, so a partition taken again does not inherit it", async () => {
		const time = { now: 0 };
		const holding: { current: number | undefined } = { current: 1 };
		const watches = createPartitionSendWatches({
			ctx: { now: () => time.now, holdingOf: () => holding.current },
		});
		const old = Promise.withResolvers<void>();
		void watches.watchFor({ partition: 80 }).track(() => old.promise);
		holding.current = 2;
		await watches.watchFor({ partition: 80 }).track(async () => undefined);
		time.now = 1_500;
		function isCurrent({ holding: sent }: { holding: number }): boolean {
			return sent === holding.current;
		}
		expect(watches.take({ now: time.now, isCurrent })).toEqual([
			{ partition: 80, holding: 2, longestInFlightMs: 0 },
		]);
		old.resolve();
	});

	test("a send made while its partition is not held is never watched", async () => {
		const watches = createPartitionSendWatches({
			ctx: { now: () => 0, holdingOf: () => undefined },
		});
		expect(
			await watches.watchFor({ partition: 80 }).track(async () => "sent"),
		).toBe("sent");
		expect(watches.take({ now: 1_000, isCurrent: always })).toEqual([]);
	});
});
