import { describe, expect, test } from "bun:test";
import {
	type FinalizeCommand,
	parseFinalizeCommand,
	type WorkerLock,
} from "@autumn/balance-engine";
import type { CommandRecord } from "@autumn/kafka";
import {
	createPipeline,
	customers,
	identityOf,
} from "../../fixtures/commandPipeline.js";
import {
	createTrackCommand,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";

type Pipeline = ReturnType<typeof createPipeline>;

/** The sync check-with-lock path: a track that opens a lock, answered once the store holds the lock row. */
const takeLock = async ({
	pipeline,
	customerId,
	lockId,
	value = 10,
}: {
	pipeline: Pipeline;
	customerId: string;
	lockId: string;
	value?: number;
}): Promise<WorkerLock> => {
	const reply = await pipeline.processor.track({
		command: {
			...createTrackCommand({
				identity: identityOf({ customerId }),
				commandId: `lock_${lockId}`,
				value,
			}),
			lock: {
				id: `lck_${lockId}`,
				lockId,
				expiresAt: testOccurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	const opened = reply.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (opened?.table !== "locks" || opened.op !== "insert")
		throw new Error("Expected the track to open a lock");
	return opened.row;
};

/** What the server queues when the owner is unreachable: the lock row it read, and the value to settle at. */
const finalizeOf = ({
	lock,
	finalValue,
	commandId = `finalize_${lock.lock_id}`,
}: {
	lock: WorkerLock;
	finalValue: number | null;
	commandId?: string;
}): FinalizeCommand =>
	parseFinalizeCommand({
		input: {
			schemaVersion: 1,
			type: "finalize",
			commandId,
			requestId: `req_${commandId}`,
			identity: identityOf({ customerId: lock.customer_id }),
			occurredAt: testOccurredAt,
			org: testOrg,
			lock,
			internalFeatureId: "feat_messages",
			finalValue,
			properties: null,
		},
	});

const balanceOf = ({
	pipeline,
	customerId,
}: {
	pipeline: Pipeline;
	customerId: string;
}) => {
	const state = pipeline.readState({ customerId });
	return {
		balance: state?.customerEntitlements[0]?.balance,
		openLocks: state?.openLocks.map((lock) => lock.id),
	};
};

describe("queued finalize", () => {
	test("a lock taken on the sync path settles through a queued finalize: confirm keeps it, release returns it, an override settles at its value", async () => {
		const pipeline = createPipeline();
		try {
			const [confirmed, released, overridden] = await Promise.all(
				customers.map((customerId, index) =>
					takeLock({ pipeline, customerId, lockId: `L${index}` }),
				),
			);
			if (!confirmed || !released || !overridden)
				throw new Error("Expected three locks");
			expect(
				customers.map((customerId) => balanceOf({ pipeline, customerId })),
			).toEqual(
				customers.map((_, index) => ({
					balance: 990,
					openLocks: [`lck_L${index}`],
				})),
			);

			await pipeline.consumeBatch({
				commands: [
					finalizeOf({ lock: confirmed, finalValue: null }),
					finalizeOf({ lock: released, finalValue: 0 }),
					finalizeOf({ lock: overridden, finalValue: 25 }),
				],
			});

			expect(
				customers.map((customerId) => balanceOf({ pipeline, customerId })),
			).toEqual([
				{ balance: 990, openLocks: [] },
				{ balance: 1_000, openLocks: [] },
				{ balance: 975, openLocks: [] },
			]);
			expect(pipeline.parked).toEqual([]);
			expect(pipeline.readBookmark()).toBe(3n);
		} finally {
			await pipeline.close();
		}
	});

	test("a queued finalize for a closed or unknown lock is consumed with a warning, and the partition carries on", async () => {
		const pipeline = createPipeline();
		try {
			const lock = await takeLock({
				pipeline,
				customerId: "cus_1",
				lockId: "L1",
			});
			const unknown: WorkerLock = { ...lock, id: "lck_unknown", lock_id: "L?" };
			const commands: CommandRecord[] = [
				finalizeOf({ lock, finalValue: 0 }),
				finalizeOf({ lock, finalValue: 0, commandId: "finalize_again" }),
				finalizeOf({ lock: unknown, finalValue: 0 }),
				createTrackCommand({
					identity: identityOf({ customerId: "cus_1" }),
					commandId: "track_after",
					value: 1,
				}),
			];
			await pipeline.consumeBatch({ commands });

			expect(pipeline.parked).toEqual([]);
			expect(pipeline.logs.filter((line) => line.includes("finalize"))).toEqual(
				["warn:Queued finalize refused", "warn:Queued finalize refused"],
			);
			expect(balanceOf({ pipeline, customerId: "cus_1" })).toEqual({
				balance: 999,
				openLocks: [],
			});
			expect(pipeline.readBookmark()).toBe(4n);
		} finally {
			await pipeline.close();
		}
	});

	test("queued finalizes in one consumed batch share Kafka commits", async () => {
		const pipeline = createPipeline();
		try {
			const locks = await Promise.all(
				Array.from({ length: 30 }, (_, index) =>
					takeLock({
						pipeline,
						customerId: customers[index % customers.length] ?? "cus_1",
						lockId: `L${index}`,
						value: 1,
					}),
				),
			);
			const syncCommits = pipeline.batches.length;

			await pipeline.consumeBatch({
				commands: locks.map((lock) => finalizeOf({ lock, finalValue: 0 })),
			});

			const finalizeCommits = pipeline.batches.slice(syncCommits);
			expect(finalizeCommits.flat()).toHaveLength(30);
			expect(finalizeCommits.length).toBeLessThan(30);
			expect(pipeline.committedSources()).toEqual(
				locks.map((_, offset) => offset),
			);
			expect(
				customers.map(
					(customerId) => balanceOf({ pipeline, customerId }).balance,
				),
			).toEqual([1_000, 1_000, 1_000]);
		} finally {
			await pipeline.close();
		}
	});

	test("an override the balance cannot fund is rejected and logged, and the lock stays open for another attempt", async () => {
		const pipeline = createPipeline();
		try {
			const lock = await takeLock({
				pipeline,
				customerId: "cus_1",
				lockId: "L1",
			});
			await pipeline.consumeBatch({
				commands: [finalizeOf({ lock, finalValue: 5_000 })],
			});

			expect(pipeline.parked).toEqual([]);
			expect(pipeline.logs).toEqual([
				"warn:Queued finalize rejected by the balance",
			]);
			expect(balanceOf({ pipeline, customerId: "cus_1" })).toEqual({
				balance: 990,
				openLocks: ["lck_L1"],
			});
		} finally {
			await pipeline.close();
		}
	});
});
