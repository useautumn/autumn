import { describe, expect, test } from "bun:test";
import {
	ConflictingTrackReceiptError,
	computeTrack,
	OutOfOrderTrackOutcomeError,
	parseCheckCommand,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import {
	checkpointLimits,
	createCommand,
	createReceiptReplayFixture,
	identity,
	partition,
	topic,
} from "./receipt-replay-fixtures.js";

// A restored receipt can outlive its live copy; replay must apply a committed successor, not conflict.
describe("receipt reuse during checkpoint replay", () => {
	test.concurrent.each([
		"before_first_track",
		"before_expiry",
		"after_expiry",
	] as const)(
		"replays from a checkpoint captured %s",
		async (checkpointCut) => {
			const fixture = await createReceiptReplayFixture({ checkpointCut });
			try {
				expect(fixture.pruned).toEqual({ deletedCount: 1 });
				expect(fixture.checkpoint.receipts).toHaveLength(
					checkpointCut === "before_expiry" ? 1 : 0,
				);
				fixture.restoredStore.applyDurableMutations({ records: fixture.tail });

				expect(fixture.restoredStore.readState({ identity })).toEqual(
					fixture.liveStore.readState({ identity }),
				);
				expect(fixture.restoredStore.readState({ identity })).toMatchObject({
					revision: 2,
					featureStatesById: {
						messages: { customerEntitlements: [{ balance: 2, usage: 8 }] },
					},
				});
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					3n,
				);
				const retry = await fixture.restoredProcessor.track({
					command: { ...fixture.reusedCommand, requestId: "req_retry" },
				});
				expect(retry).toEqual({
					kind: "duplicate",
					outcome: fixture.reusedOutcome,
				});
				expect(fixture.records).toHaveLength(3);
				const initializationRetry = await fixture.restoredProcessor.initialize({
					command: parseInitializeCommand({
						input: {
							schemaVersion: 1,
							type: "initialize",
							requestId: "restore-initialize-retry",
							identity,
							initializationId: fixture.initialization.initializationId,
							state: fixture.initialization.state,
							occurredAt: fixture.now,
						},
					}),
				});
				expect(initializationRetry).toEqual({
					kind: "duplicate",
					state: fixture.initialization.state,
				});
				const checked = await fixture.restoredProcessor.check({
					command: parseCheckCommand({
						input: {
							schemaVersion: 1,
							type: "check",
							requestId: "restored-check",
							identity,
							entityId: null,
							featureId: "messages",
							requiredBalance: 1,
							properties: null,
							occurredAt: fixture.now,
						},
					}),
				});
				expect(checked).toMatchObject({
					kind: "decided",
					balance: 2,
					revision: 2,
					balanceSnapshot: {
						id: "messages_monthly",
						externalId: "monthly-grant",
						balance: 2,
						usage: 8,
						granted: 10,
						planId: "pro",
						reset: {
							interval: "month",
							intervalCount: 1,
							nextResetAt: 1_800_000_000_000,
						},
						expiresAt: null,
					},
				});
				expect(fixture.records).toHaveLength(3);
				const checkpoint = parsePartitionCheckpoint({
					input: fixture.restoredStore.capturePartitionCheckpoint({
						topic,
						partition,
						createdAt: fixture.now,
						limits: checkpointLimits,
					}).serialized,
				});
				expect(checkpoint.receipts).toMatchObject([
					{ recordOffset: 2n, outcome: fixture.reusedOutcome },
				]);
				expect(
					fixture.restoredStore.pruneExpiredTrackReceipts({
						topic,
						partition,
						expiresAtOrBefore: fixture.firstOutcome.deduplicationExpiresAt,
						limit: 1,
					}),
				).toEqual({ deletedCount: 0 });
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"rolls back receipt replacement with the rest of a failed batch",
		async () => {
			const fixture = await createReceiptReplayFixture();
			try {
				const stateBefore = fixture.restoredStore.readState({ identity });
				if (!stateBefore) throw new Error("Expected restored state");
				const staleDecision = computeTrack({
					state: stateBefore,
					command: createCommand({ commandId: "cmd_stale", value: 1 }),
					deduplicationExpiresAt: fixture.reusedOutcome.deduplicationExpiresAt,
				});
				if (staleDecision.kind !== "new")
					throw new Error("Expected a track outcome");
				expect(() =>
					fixture.restoredStore.applyDurableMutations({
						records: [
							...fixture.tail,
							{
								position: { topic, partition, offset: 3n },
								mutation: staleDecision.outcome,
							},
						],
					}),
				).toThrow(OutOfOrderTrackOutcomeError);
				expect(fixture.restoredStore.readState({ identity })).toEqual(
					stateBefore,
				);
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					2n,
				);
				expect(
					fixture.restoredStore.readTrackReceipt({
						identity,
						commandId: fixture.reusedCommand.commandId,
					}),
				).toEqual(fixture.firstOutcome);

				fixture.restoredStore.applyDurableMutations({ records: fixture.tail });
				expect(fixture.restoredStore.readState({ identity })).toEqual(
					fixture.liveStore.readState({ identity }),
				);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"does not replace the newest receipt with a conflicting older outcome",
		async () => {
			const fixture = await createReceiptReplayFixture();
			try {
				fixture.restoredStore.applyDurableMutations({ records: fixture.tail });
				expect(() =>
					fixture.restoredStore.applyDurableTrackOutcome({
						position: { topic, partition, offset: 3n },
						outcome: { ...fixture.firstOutcome, requestId: "req_conflict" },
					}),
				).toThrow(ConflictingTrackReceiptError);
				expect(fixture.restoredStore.readState({ identity })).toEqual(
					fixture.liveStore.readState({ identity }),
				);
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					3n,
				);
				expect(
					fixture.restoredStore.readTrackReceipt({
						identity,
						commandId: fixture.reusedCommand.commandId,
					}),
				).toEqual(fixture.reusedOutcome);
			} finally {
				await fixture.close();
			}
		},
	);
});
