import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	parseTrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { PartitionCheckpointLimitExceededError } from "../../../../src/state/checkpoint/restorePartitionCheckpoint.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../../src/state/sqliteBalanceStateStore.js";

const topic = "metering-events-v1";
const partition = 0;
const checkpointCreatedAt = 1_700_000_000_000;
const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;
const limits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

const createStore = (): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-capture-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	return { directory, store };
};

const closeStore = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const outcomeFor = ({
	state,
	commandId,
	deduplicationExpiresAt,
}: {
	state: ReturnType<typeof createCustomerMeteringState>;
	commandId: string;
	deduplicationExpiresAt: number;
}): TrackOutcome => {
	const decision = computeTrack({
		state,
		deduplicationExpiresAt,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId: `req_${commandId}`,
				identity,
				entityId: null,
				featureId: "messages",
				value: 1,
				overageBehavior: "reject",
				properties: null,
				occurredAt: checkpointCreatedAt - 1,
			},
		}),
	});
	if (decision.kind !== "new") throw new Error("Expected a new track outcome");
	return decision.outcome;
};

describe("capture partition checkpoint", () => {
	test("captures one read-only cut and filters receipts using its createdAt", () => {
		const fixture = createStore();
		try {
			const initialState = createCustomerMeteringState({
				identity,
				featureStatesById: {
					messages: {
						kind: "direct_metered_v1",
						customerEntitlements: [
							{ id: "messages_monthly", balance: 10, usage: 0 },
						],
					},
				},
			});
			fixture.store.applyDurableStateInitialization({
				position: { topic, partition, offset: 0n },
				initialization: {
					schemaVersion: 1,
					type: "state_initialized",
					initializationId: "init_1",
					initializedAt: checkpointCreatedAt - 10,
					state: initialState,
				},
			});
			const expiredOutcome = outcomeFor({
				state: initialState,
				commandId: "cmd_expired",
				deduplicationExpiresAt: checkpointCreatedAt,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 1n },
				outcome: expiredOutcome,
			});
			const stateAfterExpiredOutcome = executeTrack({
				state: initialState,
				outcome: expiredOutcome,
			}).state;
			const retainedOutcome = outcomeFor({
				state: stateAfterExpiredOutcome,
				commandId: "cmd_retained",
				deduplicationExpiresAt: checkpointCreatedAt + 1,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 2n },
				outcome: retainedOutcome,
			});

			const checkpoint = fixture.store.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt: checkpointCreatedAt,
				limits,
			});

			expect(checkpoint).toMatchObject({
				createdAt: checkpointCreatedAt,
				nextOffset: 3n,
				states: [{ state: { revision: 2 } }],
				receipts: [
					{
						recordOffset: 2n,
						outcome: { commandId: "cmd_retained" },
					},
				],
			});
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: "cmd_expired",
				}),
			).toEqual(expiredOutcome);
		} finally {
			closeStore(fixture);
		}
	});

	test("refuses a cut that exceeds its state or serialized-size limits", () => {
		const fixture = createStore();
		try {
			for (const [offset, customerId] of ["cus_1", "cus_2"].entries()) {
				const state = createCustomerMeteringState({
					identity: { ...identity, customerId },
					featureStatesById: {},
				});
				fixture.store.applyDurableStateInitialization({
					position: { topic, partition, offset: BigInt(offset) },
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId: `init_${customerId}`,
						initializedAt: checkpointCreatedAt - 1,
						state,
					},
				});
			}

			expect(() =>
				fixture.store.capturePartitionCheckpoint({
					topic,
					partition,
					createdAt: checkpointCreatedAt,
					limits: { ...limits, maxStates: 1 },
				}),
			).toThrow(PartitionCheckpointLimitExceededError);
			expect(() =>
				fixture.store.capturePartitionCheckpoint({
					topic,
					partition,
					createdAt: checkpointCreatedAt,
					limits: { ...limits, maxSerializedBytes: 1 },
				}),
			).toThrow(PartitionCheckpointLimitExceededError);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(2n);
		} finally {
			closeStore(fixture);
		}
	});

	test("prunes expired receipts in bounded batches without changing state", () => {
		const fixture = createStore();
		try {
			const initialState = createCustomerMeteringState({
				identity,
				featureStatesById: {
					messages: {
						kind: "direct_metered_v1",
						customerEntitlements: [
							{ id: "messages_monthly", balance: 10, usage: 0 },
						],
					},
				},
			});
			fixture.store.applyDurableStateInitialization({
				position: { topic, partition, offset: 0n },
				initialization: {
					schemaVersion: 1,
					type: "state_initialized",
					initializationId: "init_1",
					initializedAt: checkpointCreatedAt - 10,
					state: initialState,
				},
			});
			const oldestOutcome = outcomeFor({
				state: initialState,
				commandId: "cmd_oldest",
				deduplicationExpiresAt: checkpointCreatedAt - 2,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 1n },
				outcome: oldestOutcome,
			});
			const stateAfterOldest = executeTrack({
				state: initialState,
				outcome: oldestOutcome,
			}).state;
			const newerOutcome = outcomeFor({
				state: stateAfterOldest,
				commandId: "cmd_newer",
				deduplicationExpiresAt: checkpointCreatedAt - 1,
			});
			fixture.store.applyDurableTrackOutcome({
				position: { topic, partition, offset: 2n },
				outcome: newerOutcome,
			});

			expect(
				fixture.store.pruneExpiredTrackReceipts({
					topic,
					partition,
					expiresAtOrBefore: checkpointCreatedAt,
					limit: 1,
				}),
			).toEqual({ deletedCount: 1 });
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: "cmd_oldest",
				}),
			).toBeNull();
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: "cmd_newer",
				}),
			).toEqual(newerOutcome);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
			expect(fixture.store.readState({ identity })?.revision).toBe(2);
		} finally {
			closeStore(fixture);
		}
	});
});
