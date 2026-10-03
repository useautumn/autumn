/**
 * A finalize the server queues when the lock's owner is unreachable is consumed, not dropped: it
 * settles the lock through the same decide as a sync finalize and shares Kafka commits with its batch.
 *
 * Red (before): the consumer had no finalize case, so the record was skipped as "not consumable yet"
 * and the lock stayed open while the server had already answered success.
 * Green (after): confirm, release and override settle and close the lock; a closed or unknown lock is
 * refused and consumed without parking; finalizes in one batch share commits.
 */

import { describe, expect, test } from "bun:test";
import type { WorkerLock } from "@autumn/balance-engine";
import type { CommandRecord } from "@autumn/kafka";
import {
	type CommandPipeline,
	createCommandPipeline,
	customers,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
import {
	finalizeOf,
	takeLock,
	trackOf,
} from "../../fixtures/queuedCommands.js";

const balanceOf = ({
	pipeline,
	customerId,
}: {
	pipeline: CommandPipeline;
	customerId: string;
}) => {
	const state = pipeline.readState({ customerId });
	return {
		balance: state?.customerEntitlements[0]?.balance,
		openLocks: state?.openLocks.map((lock) => lock.id),
	};
};

describe("queued finalize", () => {
	test("a lock taken on the sync path settles through a queued finalize: confirm keeps the usage, release returns it, an override settles at its value", async () => {
		const pipeline = createCommandPipeline();
		try {
			const [confirmed, released, overridden] = await Promise.all(
				customers.map((customerId, index) =>
					takeLock({ pipeline, customerId, lockId: `L${index}` }),
				),
			);
			if (!confirmed || !released || !overridden)
				throw new Error("Expected three locks");

			await pipeline.consumeBatch({
				commands: [
					finalizeOf({ lock: confirmed, finalValue: null }),
					finalizeOf({ lock: released, finalValue: 0 }),
					finalizeOf({ lock: overridden, finalValue: 25 }),
				],
			});
			await pipeline.drain();

			expect(
				customers.map((customerId) => balanceOf({ pipeline, customerId })),
			).toEqual([
				{ balance: STARTING_BALANCE - 10, openLocks: [] },
				{ balance: STARTING_BALANCE, openLocks: [] },
				{ balance: STARTING_BALANCE - 25, openLocks: [] },
			]);
			expect(pipeline.parked).toEqual([]);
			expect(pipeline.readBookmark()).toBe(3n);
		} finally {
			await pipeline.close();
		}
	});

	test("a finalize for a closed or unknown lock is refused and consumed, and the partition carries on", async () => {
		const pipeline = createCommandPipeline();
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
				trackOf({ customerId: "cus_1", commandId: "track_after" }),
			];
			await pipeline.consumeBatch({ commands });
			await pipeline.drain();

			expect(pipeline.parked).toEqual([]);
			expect(pipeline.logs.filter((line) => line.includes("finalize"))).toEqual(
				["warn:Queued finalize refused", "warn:Queued finalize refused"],
			);
			expect(balanceOf({ pipeline, customerId: "cus_1" })).toEqual({
				balance: STARTING_BALANCE - 1,
				openLocks: [],
			});
			expect(pipeline.readBookmark()).toBe(4n);
		} finally {
			await pipeline.close();
		}
	});

	test("finalizes in one consumed batch share Kafka commits; one the balance cannot fund is logged and leaves its lock open", async () => {
		const pipeline = createCommandPipeline();
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
			const syncCommits = pipeline.commits.length;
			const [unfunded, ...funded] = locks;
			if (!unfunded) throw new Error("Expected a lock");

			const commands = [
				finalizeOf({ lock: unfunded, finalValue: 5_000 }),
				...funded.map((lock) => finalizeOf({ lock, finalValue: 0 })),
			];
			await pipeline.consumeBatch({ commands });
			await pipeline.drain();

			const finalizeCommits = pipeline.commits.slice(syncCommits);
			expect(finalizeCommits.flat()).toHaveLength(30);
			expect(finalizeCommits.length).toBeLessThan(30);
			expect(pipeline.committedSources()).toEqual(
				commands.map((_, offset) => offset),
			);
			expect(pipeline.logs).toEqual([
				"warn:Queued finalize rejected by the balance",
			]);
			expect(balanceOf({ pipeline, customerId: "cus_1" })).toEqual({
				balance: STARTING_BALANCE - 1,
				openLocks: ["lck_L0"],
			});
		} finally {
			await pipeline.close();
		}
	});
});
