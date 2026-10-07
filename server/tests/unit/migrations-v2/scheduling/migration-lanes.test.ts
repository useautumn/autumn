// Contract: K lanes over dealt keyset segments cover every customer exactly once,
// never run more than K chunks at once, and a slow lane never holds the others back.
import { describe, expect, test } from "bun:test";
import {
	carveMigrationSegments,
	type MigrationSegment,
} from "@/internal/migrations/v2/run/chunks/carveMigrationSegments.js";
import { dealSegmentsToLanes } from "@/internal/migrations/v2/run/chunks/dealSegmentsToLanes.js";
import type {
	MigrationChunkResult,
	MigrationChunkRunner,
} from "@/internal/migrations/v2/run/chunks/iterateMigrationChunks.js";
import { runMigrationLane } from "@/internal/migrations/v2/run/chunks/runMigrationLane.js";

const PAGE_SIZE = 7;
const CHUNK_SLICE = 3;

const customerIds = (count: number) =>
	Array.from({ length: count }, (_, i) => `cus_${String(i).padStart(4, "0")}`)
		.sort()
		.reverse();

/** Fake keyset over `ids` (DESC) with a checkpoint: processed ids never match again. */
const createFakeMigration = ({ ids }: { ids: string[] }) => {
	const processedCount = new Map<string, number>();
	const isUnprocessed = (id: string) => !processedCount.has(id);
	const below = (cursor?: string) => (id: string) =>
		cursor === undefined || id < cursor;

	const loadIdPage = async ({ cursor }: { cursor?: string }) => {
		const matching = ids.filter(below(cursor)).filter(isUnprocessed);
		return {
			ids: matching.slice(0, PAGE_SIZE),
			isLastPage: matching.length <= PAGE_SIZE,
		};
	};

	const runChunk: MigrationChunkRunner = async ({ cursor, floor }) => {
		const segment = ids
			.filter(below(cursor))
			.filter((id) => floor === undefined || id >= floor)
			.filter(isUnprocessed);
		const slice = segment.slice(0, CHUNK_SLICE);
		for (const id of slice)
			processedCount.set(id, (processedCount.get(id) ?? 0) + 1);
		return {
			processed: slice.length,
			completion: segment.length > CHUNK_SLICE ? "slice_complete" : "exhausted",
			cursor: slice.at(-1) ?? null,
		};
	};

	return {
		processedCount,
		segments: () => carveMigrationSegments({ loadIdPage }),
		runChunk,
	};
};

const never = async () => false;

const runLanes = ({
	laneSegments,
	runChunk,
}: {
	laneSegments: MigrationSegment[][];
	runChunk: MigrationChunkRunner;
}) =>
	Promise.all(
		laneSegments.map((segments) =>
			runMigrationLane({ segments, isCancelRequested: never, runChunk }),
		),
	);

describe("carveMigrationSegments", () => {
	test("segments are disjoint [floor, cursor) ranges and the last one is open", async () => {
		const ids = customerIds(PAGE_SIZE * 2 + 1);

		expect(await createFakeMigration({ ids }).segments()).toEqual([
			{ cursor: undefined, floor: ids[PAGE_SIZE - 1] },
			{ cursor: ids[PAGE_SIZE - 1], floor: ids[PAGE_SIZE * 2 - 1] },
			{ cursor: ids[PAGE_SIZE * 2 - 1], floor: undefined },
		]);
	});

	test("a page that fits is a single open-ended segment", async () => {
		const ids = customerIds(PAGE_SIZE);

		expect(await createFakeMigration({ ids }).segments()).toEqual([
			{ cursor: undefined, floor: undefined },
		]);
	});

	test("an empty keyset carves nothing", async () => {
		expect(await createFakeMigration({ ids: [] }).segments()).toEqual([]);
	});
});

describe("dealSegmentsToLanes", () => {
	const segments = Array.from({ length: 5 }, (_, i) => ({ cursor: `s${i}` }));

	test("deals round-robin so every segment belongs to exactly one lane", () => {
		expect(dealSegmentsToLanes({ segments, laneCount: 2 })).toEqual([
			[segments[0], segments[2], segments[4]],
			[segments[1], segments[3]],
		]);
	});

	test("never opens more lanes than there are segments", () => {
		expect(dealSegmentsToLanes({ segments, laneCount: 8 })).toHaveLength(5);
		expect(dealSegmentsToLanes({ segments: [], laneCount: 3 })).toEqual([]);
	});
});

describe("runMigrationLane", () => {
	test("K lanes cover every customer exactly once", async () => {
		for (const laneCount of [2, 3, 4, 8]) {
			for (const count of [0, 1, PAGE_SIZE, PAGE_SIZE + 1, 50]) {
				const ids = customerIds(count);
				const fake = createFakeMigration({ ids });
				const laneSegments = dealSegmentsToLanes({
					segments: await fake.segments(),
					laneCount,
				});

				const lanes = await runLanes({ laneSegments, runChunk: fake.runChunk });

				expect(lanes.length).toBeLessThanOrEqual(laneCount);
				expect(lanes.reduce((sum, lane) => sum + lane.processed, 0)).toBe(
					count,
				);
				expect([...fake.processedCount.keys()].sort()).toEqual([...ids].sort());
				expect([...fake.processedCount.values()].every((n) => n === 1)).toBe(
					true,
				);
			}
		}
	});

	test("never has more than K chunks in flight", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		const laneSegments = dealSegmentsToLanes({
			segments: await fake.segments(),
			laneCount: 3,
		});
		let inFlight = 0;
		let peak = 0;
		const runChunk: MigrationChunkRunner = async (args) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 1));
			inFlight--;
			return fake.runChunk(args);
		};

		await runLanes({ laneSegments, runChunk });

		expect(peak).toBe(3);
	});

	test("a slow lane does not hold the other lanes back", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		const laneSegments = dealSegmentsToLanes({
			segments: await fake.segments(),
			laneCount: 2,
		});
		const slowFloor = laneSegments[0][0].floor;
		let releaseSlowChunk = () => {};
		const slowChunk = new Promise<void>((resolve) => {
			releaseSlowChunk = resolve;
		});
		const finished: string[] = [];
		const runChunk: MigrationChunkRunner = async (args) => {
			const isSlowLanesFirstChunk =
				args.floor === slowFloor && args.cursor === undefined;
			if (isSlowLanesFirstChunk) await slowChunk;
			finished.push(args.floor === slowFloor ? "slow" : "fast");
			return fake.runChunk(args);
		};

		const lanes = Promise.all(
			laneSegments.map((segments) =>
				runMigrationLane({ segments, isCancelRequested: never, runChunk }),
			),
		);
		await new Promise((resolve) => setTimeout(resolve, 20));
		const fastChunksBeforeRelease = finished.filter((lane) => lane === "fast");
		releaseSlowChunk();
		const [slowLane, fastLane] = await lanes;

		expect(fastChunksBeforeRelease.length).toBeGreaterThan(1);
		expect(finished.indexOf("slow")).toBeGreaterThan(1);
		expect(slowLane.processed + fastLane.processed).toBe(50);
	});

	test("a continuing segment keeps its floor and moves its cursor", async () => {
		const ids = customerIds(PAGE_SIZE * 2);
		const fake = createFakeMigration({ ids });
		const calls: Parameters<MigrationChunkRunner>[0][] = [];

		await runMigrationLane({
			segments: await fake.segments(),
			isCancelRequested: never,
			runChunk: async (args) => {
				calls.push(args);
				return fake.runChunk(args);
			},
		});

		expect(calls.slice(0, 3)).toEqual([
			{
				limit: undefined,
				chunkIndex: 0,
				cursor: undefined,
				floor: ids[PAGE_SIZE - 1],
			},
			{
				limit: undefined,
				chunkIndex: 1,
				cursor: ids[CHUNK_SLICE - 1],
				floor: ids[PAGE_SIZE - 1],
			},
			{
				limit: undefined,
				chunkIndex: 2,
				cursor: ids[CHUNK_SLICE * 2 - 1],
				floor: ids[PAGE_SIZE - 1],
			},
		]);
		expect(calls.at(-1)?.floor).toBeUndefined();
	});

	test("stops at the next chunk when cancellation is requested", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		let chunks = 0;

		const lane = await runMigrationLane({
			segments: await fake.segments(),
			isCancelRequested: async () => chunks >= 2,
			runChunk: async (args) => {
				chunks++;
				return fake.runChunk(args);
			},
		});

		expect(lane).toEqual({ processed: 6, chunks: 2, canceled: true });
	});

	test("reports cancellation detected inside a chunk", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });
		const stopped: MigrationChunkResult = {
			processed: 0,
			completion: "stopped",
			cursor: null,
		};

		const lane = await runMigrationLane({
			segments: await fake.segments(),
			isCancelRequested: never,
			runChunk: async (args) =>
				args.chunkIndex === 1 ? stopped : fake.runChunk(args),
		});

		expect(lane).toEqual({ processed: 3, chunks: 2, canceled: true });
	});

	test("rejects a continuation that made no progress", async () => {
		const fake = createFakeMigration({ ids: customerIds(50) });

		await expect(
			runMigrationLane({
				segments: await fake.segments(),
				isCancelRequested: never,
				runChunk: async () => ({
					processed: 0,
					completion: "slice_complete",
					cursor: null,
				}),
			}),
		).rejects.toThrow("made no progress");
	});
});
