import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	OutOfOrderMutationError,
	parseCheckCommand,
	parseInitializeCommand,
} from "@autumn/balance-engine";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { ConflictingMutationReceiptError } from "../../../../src/state/stateStoreErrors.js";
import {
	applyDurableMutation,
	createCatalogFor,
	createCatalogRowsFor,
} from "../../../fixtures/mutations.js";
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
				expect(fixture.pruned).toEqual({ deletedCount: 2 });
				expect(fixture.checkpoint.receipts).toHaveLength(
					{ before_first_track: 1, before_expiry: 2, after_expiry: 0 }[
						checkpointCut
					],
				);
				fixture.restoredStore.applyDurableMutations({ records: fixture.tail });

				expect(fixture.restoredStore.readState({ identity })).toEqual(
					fixture.liveStore.readState({ identity }),
				);
				expect(fixture.restoredStore.readState({ identity })).toMatchObject({
					revision: 3,
					customerEntitlements: expect.arrayContaining([
						expect.objectContaining({ id: "messages_monthly", balance: 0 }),
					]),
				});
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					3n,
				);
				const retry = await fixture.restoredProcessor.track({
					command: { ...fixture.reusedCommand, requestId: "req_retry" },
				});
				expect(retry).toEqual({
					kind: "duplicate",
					mutation: fixture.reusedMutation,
				});
				expect(fixture.records).toHaveLength(3);
				const initializationRetry = await fixture.restoredProcessor.initialize({
					command: parseInitializeCommand({
						input: {
							schemaVersion: 1,
							type: "initialize",
							requestId: "restore-initialize-retry",
							identity,
							commandId: fixture.initialization.id,
							state: fixture.baselineState,
							catalogRows: createCatalogRowsFor({
								state: fixture.baselineState,
							}),
							occurredAt: fixture.now,
						},
					}),
				});
				// Once the initialize receipt expires, a replay only sees that state exists.
				expect(initializationRetry).toEqual(
					checkpointCut === "after_expiry"
						? { kind: "already_initialized" }
						: {
								kind: "duplicate",
								state: applyMutation({
									state: null,
									mutation: fixture.initialization,
								}),
							},
				);
				const checked = await fixture.restoredProcessor.check({
					command: parseCheckCommand({
						input: {
							schemaVersion: 1,
							type: "check",
							requestId: "restored-check",
							identity,
							featureId: "messages",
							requiredBalance: 1,
							properties: null,
							occurredAt: fixture.now,
						},
					}),
				});
				expect(checked).toMatchObject({
					kind: "decided",
					balance: 0,
					revision: 3,
					customerEntitlement: {
						id: "messages_monthly",
						external_id: "monthly-grant",
						balance: 0,
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
					{ recordOffset: 2n, mutation: fixture.reusedMutation },
				]);
				fixture.restoredStore.pruneExpiredReceipts({
					topic,
					partition,
					expiresAtOrBefore: fixture.firstMutation.receipt.expiresAt,
					limit: 10,
				});
				expect(
					fixture.restoredStore.readReceipt({
						identity,
						mutationId: fixture.reusedCommand.commandId,
					}),
				).toEqual(fixture.reusedMutation);
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
					catalog: createCatalogFor({ state: stateBefore }),
					command: createCommand({ commandId: "cmd_stale", value: 1 }),
					deduplicationExpiresAt: fixture.reusedMutation.receipt.expiresAt,
				});
				if (staleDecision.kind !== "new")
					throw new Error("Expected a track mutation");
				expect(() =>
					fixture.restoredStore.applyDurableMutations({
						records: [
							...fixture.tail,
							{
								position: { topic, partition, offset: 3n },
								mutation: staleDecision.mutation,
							},
						],
					}),
				).toThrow(OutOfOrderMutationError);
				expect(fixture.restoredStore.readState({ identity })).toEqual(
					stateBefore,
				);
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					2n,
				);
				expect(
					fixture.restoredStore.readReceipt({
						identity,
						mutationId: fixture.reusedCommand.commandId,
					}),
				).toEqual(fixture.firstMutation);

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
				const currentState = fixture.restoredStore.readState({ identity });
				if (!currentState) throw new Error("Expected restored state");
				const conflicting = computeTrack({
					state: currentState,
					catalog: createCatalogFor({ state: currentState }),
					command: createCommand({
						commandId: fixture.reusedCommand.commandId,
						value: 1,
					}),
					deduplicationExpiresAt: fixture.reusedMutation.receipt.expiresAt,
				});
				if (conflicting.kind !== "new")
					throw new Error("Expected a track mutation");
				expect(() =>
					applyDurableMutation({
						store: fixture.restoredStore,
						topic,
						partition,
						offset: 3n,
						mutation: conflicting.mutation,
					}),
				).toThrow(ConflictingMutationReceiptError);
				expect(fixture.restoredStore.readState({ identity })).toEqual(
					fixture.liveStore.readState({ identity }),
				);
				expect(fixture.restoredStore.readNextOffset({ topic, partition })).toBe(
					3n,
				);
				expect(
					fixture.restoredStore.readReceipt({
						identity,
						mutationId: fixture.reusedCommand.commandId,
					}),
				).toEqual(fixture.reusedMutation);
			} finally {
				await fixture.close();
			}
		},
	);
});
