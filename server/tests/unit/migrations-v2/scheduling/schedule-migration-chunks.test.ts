// Contract: the parent keeps K chunks in flight over disjoint customer pages, refills a slot
// the moment a chunk settles, retries a failed page once, and stops refilling on cancel.
import { describe, expect, test } from "bun:test";
import { scheduleMigrationChunks } from "@/internal/migrations/v2/run/chunks/scheduleMigrationChunks.js";
import type {
	MigrationChunkDispatcher,
	MigrationChunkOutcome,
} from "@/internal/migrations/v2/run/types/migrationChunkDispatcher.js";
import type { RunMigrationChunkPayload } from "@/internal/migrations/v2/run/types/migrationRunPayloads.js";

type Customers = RunMigrationChunkPayload["customers"];

const customers = (count: number): Customers =>
	Array.from({ length: count }, (_, i) => ({
		internal_id: `cus_${i}`,
		id: null,
	}));

async function* pagesOf(all: Customers, pageSize: number) {
	for (let i = 0; i < all.length; i += pageSize)
		yield all.slice(i, i + pageSize);
}

const buildPayload = ({
	pageIndex,
	attempt,
	customers,
}: {
	pageIndex: number;
	attempt: number;
	customers: Customers;
}) => ({ pageIndex, attempt, customers }) as RunMigrationChunkPayload;

/** Chunks finish only when the test releases them, so in-flight state is observable. */
const createManualDispatcher = () => {
	const pending = new Map<string, (outcome: MigrationChunkOutcome) => void>();
	const outcomes = new Map<string, MigrationChunkOutcome>();
	const started: RunMigrationChunkPayload[] = [];
	let peakInFlight = 0;
	const key = (p: { pageIndex: number; attempt: number }) =>
		`${p.pageIndex}:${p.attempt}`;

	const dispatcher: MigrationChunkDispatcher = {
		start: async (payload) => {
			started.push(payload);
			peakInFlight = Math.max(peakInFlight, pending.size + 1);
			pending.set(key(payload), (outcome) => {
				pending.delete(key(payload));
				outcomes.set(key(payload), outcome);
			});
			return { poll: async () => outcomes.get(key(payload)) };
		},
		idle: async () => {},
	};

	return {
		dispatcher,
		started,
		inFlight: () => [...pending.keys()],
		peakInFlight: () => peakInFlight,
		finish: (pageIndex: number, attempt = 1) =>
			pending.get(`${pageIndex}:${attempt}`)?.({
				ok: true,
				result: { processed: 1 },
			}),
		fail: (pageIndex: number, attempt = 1) =>
			pending.get(`${pageIndex}:${attempt}`)?.({
				ok: false,
				error: new Error("chunk crashed"),
			}),
	};
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Drives the scheduler while `step` decides which chunks finish after each poll. */
const drive = async ({
	all,
	pageSize,
	concurrency,
	manual,
	step,
	isCancelRequested = async () => false,
}: {
	all: Customers;
	pageSize: number;
	concurrency: number;
	manual: ReturnType<typeof createManualDispatcher>;
	step: (round: number) => void;
	isCancelRequested?: () => Promise<boolean>;
}) => {
	let round = 0;
	const dispatcher: MigrationChunkDispatcher = {
		start: manual.dispatcher.start,
		idle: async () => {
			await tick();
			step(round++);
		},
	};
	return scheduleMigrationChunks({
		pages: pagesOf(all, pageSize),
		concurrency,
		isCancelRequested,
		buildPayload,
		dispatcher,
	});
};

describe("scheduleMigrationChunks", () => {
	test("every customer lands in exactly one chunk, in page order", async () => {
		const all = customers(23);
		const manual = createManualDispatcher();

		const result = await drive({
			all,
			pageSize: 5,
			concurrency: 3,
			manual,
			step: () => {
				for (const inFlight of manual.inFlight())
					manual.finish(Number(inFlight.split(":")[0]));
			},
		});

		const seen = manual.started.flatMap((chunk) =>
			chunk.customers.map((c) => c.internal_id),
		);
		expect(seen).toEqual(all.map((c) => c.internal_id));
		expect(manual.started.map((chunk) => chunk.pageIndex)).toEqual([
			0, 1, 2, 3, 4,
		]);
		expect(result).toEqual({ processed: 5, chunks: 5, canceled: false });
	});

	test("never has more than K chunks in flight and refills the moment one settles", async () => {
		const all = customers(30);
		const manual = createManualDispatcher();

		await drive({
			all,
			pageSize: 5,
			concurrency: 2,
			manual,
			step: (round) => {
				if (round === 0) expect(manual.inFlight()).toEqual(["0:1", "1:1"]);
				if (round === 1) manual.finish(1);
				if (round === 2) expect(manual.inFlight()).toEqual(["0:1", "2:1"]);
				if (round >= 2)
					manual.finish(Number(manual.inFlight()[0].split(":")[0]));
			},
		});

		expect(manual.peakInFlight()).toBe(2);
		expect(manual.started).toHaveLength(6);
	});

	test("retries a failed page once with the same customers, then counts it as failed", async () => {
		const all = customers(10);
		const manual = createManualDispatcher();

		const result = await drive({
			all,
			pageSize: 5,
			concurrency: 2,
			manual,
			step: (round) => {
				if (round === 0) manual.fail(0);
				if (round === 1) manual.finish(0, 2);
				if (round === 2) manual.finish(1);
			},
		});

		const retry = manual.started.find((chunk) => chunk.attempt === 2);
		expect(retry?.pageIndex).toBe(0);
		expect(retry?.customers).toEqual(manual.started[0].customers);
		expect(result).toEqual({ processed: 2, chunks: 3, canceled: false });
	});

	test("a page that fails twice fails the run after every other chunk has settled", async () => {
		const all = customers(10);
		const manual = createManualDispatcher();
		let page1SettledBeforeThrow = false;

		await expect(
			drive({
				all,
				pageSize: 5,
				concurrency: 2,
				manual,
				step: (round) => {
					if (round === 0) manual.fail(0);
					if (round === 1) manual.fail(0, 2);
					if (round === 2) {
						manual.finish(1);
						page1SettledBeforeThrow = true;
					}
				},
			}),
		).rejects.toThrow("failed twice for pages 0");
		expect(page1SettledBeforeThrow).toBe(true);
	});

	test("cancel stops refilling and waits for in-flight chunks", async () => {
		const all = customers(30);
		const manual = createManualDispatcher();
		let canceled = false;

		const result = await drive({
			all,
			pageSize: 5,
			concurrency: 2,
			manual,
			isCancelRequested: async () => canceled,
			step: (round) => {
				if (round === 0) canceled = true;
				if (round === 1) manual.finish(0);
				if (round === 2) manual.finish(1);
			},
		});

		expect(manual.started).toHaveLength(2);
		expect(result).toEqual({ processed: 2, chunks: 2, canceled: true });
	});
});
