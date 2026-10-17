import { describe, expect, test } from "bun:test";
import { judgeFleetProgress } from "../../../../src/health/stepDown/judgeFleetProgress.js";
import type { FleetProgress } from "../../../../src/health/stepDown/types/fleetProgress.js";

function progressOf(
	entries: [partition: number, highWatermark: bigint, nextOffset: bigint][],
): FleetProgress {
	return {
		highWatermarks: new Map(
			entries.map(([partition, high]) => [partition, high]),
		),
		nextOffsets: new Map(
			entries.map(([partition, , next]) => [partition, next]),
		),
	};
}

function judge({
	before,
	after,
	own = new Set<number>(),
	minKeptUp = 2,
	elapsedMs = 3_000,
}: {
	before: FleetProgress;
	after: FleetProgress;
	own?: ReadonlySet<number>;
	minKeptUp?: number;
	elapsedMs?: number;
}) {
	return judgeFleetProgress({
		before,
		after,
		ownPartitions: own,
		minKeptUp,
		elapsedMs,
		maxLagMs: 2_000,
	});
}

describe("judge fleet progress", () => {
	test("an owner keeps up when its bookmark moved past where its log stood and stays within two seconds of arrivals behind the tip", () => {
		const before = progressOf([
			[1, 100n, 98n],
			[2, 200n, 200n],
			[3, 300n, 290n],
		]);
		const after = progressOf([
			[1, 130n, 125n],
			[2, 230n, 222n],
			[3, 330n, 325n],
		]);
		expect(judge({ before, after })).toEqual({
			ok: true,
			active: 3,
			keptUp: 3,
		});
	});

	test("an owner whose backlog grows while records arrive does not keep up, though it crossed the old tip", () => {
		const before = progressOf([
			[1, 100n, 100n],
			[2, 200n, 200n],
		]);
		const after = progressOf([
			[1, 200n, 101n],
			[2, 300n, 201n],
		]);
		expect(judge({ before, after, minKeptUp: 1 })).toEqual({
			ok: false,
			active: 2,
			keptUp: 0,
		});
	});

	test("owners that fell behind their logs, as in a fleet-wide slowdown, do not keep up", () => {
		const before = progressOf([
			[1, 100n, 90n],
			[2, 200n, 190n],
			[3, 300n, 290n],
		]);
		const after = progressOf([
			[1, 120n, 100n],
			[2, 220n, 199n],
			[3, 330n, 325n],
		]);
		expect(judge({ before, after })).toEqual({
			ok: false,
			active: 3,
			keptUp: 1,
		});
	});

	test("a bookmark that did not move between the two readings never keeps up, however skewed the readings were", () => {
		const before = progressOf([
			[1, 100n, 105n],
			[2, 200n, 200n],
		]);
		const after = progressOf([
			[1, 110n, 105n],
			[2, 210n, 208n],
		]);
		expect(judge({ before, after, minKeptUp: 1 })).toEqual({
			ok: true,
			active: 2,
			keptUp: 1,
		});
	});

	test("a partition whose bookmark appeared during the check, or is missing from either reading, never keeps up", () => {
		const before: FleetProgress = {
			highWatermarks: new Map([
				[1, 100n],
				[2, 200n],
				[3, 300n],
			]),
			nextOffsets: new Map([
				[1, 100n],
				[3, 300n],
			]),
		};
		const after: FleetProgress = {
			highWatermarks: new Map([
				[1, 110n],
				[2, 210n],
				[3, 310n],
			]),
			nextOffsets: new Map([
				[1, 108n],
				[2, 208n],
			]),
		};
		expect(judge({ before, after })).toEqual({
			ok: false,
			active: 3,
			keptUp: 1,
		});
	});

	test("partitions with no new records say nothing either way, and the worker's own never count", () => {
		const before = progressOf([
			[1, 100n, 100n],
			[2, 200n, 199n],
			[3, 300n, 290n],
			[4, 400n, 390n],
		]);
		const after = progressOf([
			[1, 100n, 100n],
			[2, 210n, 205n],
			[3, 310n, 305n],
			[4, 410n, 390n],
		]);
		expect(judge({ before, after, own: new Set([4]) })).toEqual({
			ok: true,
			active: 2,
			keptUp: 2,
		});
	});

	test("an interval measured in fractional milliseconds is judged, not refused", () => {
		const before = progressOf([
			[1, 100n, 100n],
			[2, 200n, 200n],
		]);
		const after = progressOf([
			[1, 110n, 108n],
			[2, 210n, 208n],
		]);
		expect(judge({ before, after, elapsedMs: 3_000.25 })).toEqual({
			ok: true,
			active: 2,
			keptUp: 2,
		});
	});

	test("fewer partitions keeping up than the minimum is not enough, however many of the active ones kept up", () => {
		const before = progressOf([[1, 100n, 100n]]);
		const after = progressOf([[1, 105n, 104n]]);
		expect(judge({ before, after, minKeptUp: 2 })).toEqual({
			ok: false,
			active: 1,
			keptUp: 1,
		});
	});
});
