import { describe, expect, test } from "bun:test";
import {
	parseResetCommand,
	parseUpdateBalanceCommand,
	type ResetCommand,
	type TrackCommand,
	type UpdateBalanceCommand,
} from "@autumn/balance-engine";
import { BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT } from "@autumn/env/balanceWorkerConstants";
import type { CommandRecord } from "@autumn/kafka";
import {
	APPEND_MS,
	createPipeline,
	customers,
	identityOf,
} from "../../fixtures/commandPipeline.js";
import {
	createTrackCommand,
	testOccurredAt,
	testOrg,
} from "../../fixtures/mutations.js";

const trackOf = ({ index }: { index: number }): TrackCommand =>
	createTrackCommand({
		identity: identityOf({ customerId: customers[index % customers.length] }),
		commandId: `track_${index}`,
		value: 1,
	});

const resetOf = ({ index }: { index: number }): ResetCommand =>
	parseResetCommand({
		input: {
			schemaVersion: 1,
			type: "reset",
			commandId: `reset_${index}`,
			requestId: `reset_${index}`,
			identity: identityOf({ customerId: customers[index % customers.length] }),
			occurredAt: testOccurredAt,
			org: testOrg,
		},
	});

const updateBalanceOf = ({ index }: { index: number }): UpdateBalanceCommand =>
	parseUpdateBalanceCommand({
		input: {
			schemaVersion: 1,
			type: "updateBalance",
			commandId: `update_${index}`,
			requestId: `update_${index}`,
			identity: identityOf({ customerId: customers[index % customers.length] }),
			occurredAt: testOccurredAt,
			org: testOrg,
			featureId: "messages",
			internalFeatureId: "feat_messages",
			addToBalance: -1,
		},
	});

describe("queued command pipelining", () => {
	test("queued tracks in one consumed batch share Kafka commits instead of committing one by one", async () => {
		const pipeline = createPipeline();
		try {
			const commands = Array.from({ length: 30 }, (_, index) =>
				trackOf({ index }),
			);
			await pipeline.consumeBatch({ commands });

			expect(pipeline.batches.flat()).toHaveLength(30);
			expect(pipeline.batches.length).toBeLessThan(30);
			expect(pipeline.committedSources()).toEqual(
				commands.map((_, offset) => offset),
			);
			expect(pipeline.readBookmark()).toBe(30n);
		} finally {
			await pipeline.close();
		}
	});

	test("resets and balance updates pipeline the same way, and offsets and the bookmark only move forward in order", async () => {
		const pipeline = createPipeline();
		try {
			const commands: CommandRecord[] = Array.from(
				{ length: 30 },
				(_, index) =>
					[trackOf, resetOf, updateBalanceOf][index % 3]?.({ index }) ??
					trackOf({ index }),
			);
			await pipeline.consumeBatch({ commands });

			const updates = commands.filter(
				(command) => command.type === "updateBalance",
			);
			const writes = pipeline.committedSources();
			expect(writes).toEqual([...writes].sort((a, b) => a - b));
			expect(
				pipeline.batches
					.flat()
					.filter((record) => record.id.startsWith("update_")),
			).toHaveLength(updates.length);
			expect(pipeline.batches.length).toBeLessThan(writes.length);
			expect(pipeline.bookmarks).toEqual(
				[...pipeline.bookmarks].sort((a, b) => Number(a - b)),
			);
			expect(pipeline.readBookmark()).toBe(BigInt(commands.length));
		} finally {
			await pipeline.close();
		}
	});

	test("a commit the broker refused parks the partition, and no later queued command commits past it", async () => {
		const pipeline = createPipeline({ failAppendAt: 1 });
		try {
			const commands = Array.from({ length: 30 }, (_, index) =>
				trackOf({ index }),
			);
			await pipeline.consumeBatch({ commands });
			await Bun.sleep(APPEND_MS * 10);

			expect(pipeline.parked).toHaveLength(1);
			const committed = pipeline.committedSources();
			const firstGap = committed.findIndex((offset, index) => offset !== index);
			expect(firstGap).toBe(-1);
			expect(pipeline.readBookmark()).toBe(BigInt(committed.length));
		} finally {
			await pipeline.close();
		}
	});

	test("decides stop running ahead of a stalled commit once the in-flight bound is reached", async () => {
		const held = Promise.withResolvers<void>();
		const pipeline = createPipeline({ firstAppendHeld: held.promise });
		try {
			const commands = Array.from(
				{ length: BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT + 50 },
				(_, index) => trackOf({ index }),
			);
			const consumed = pipeline.consumeBatch({ commands });
			for (let polls = 0; polls < 400; polls++) {
				if (pipeline.readProcessed() >= BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT)
					break;
				await Bun.sleep(5);
			}
			await Bun.sleep(50);

			expect(pipeline.batches).toEqual([]);
			expect(pipeline.readProcessed()).toBe(
				BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT,
			);

			held.resolve();
			await consumed;
			expect(pipeline.committedSources()).toEqual(
				commands.map((_, offset) => offset),
			);
		} finally {
			held.resolve();
			await pipeline.close();
		}
	});
});
