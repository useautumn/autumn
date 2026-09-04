import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	computeTrack,
	createCustomerMeteringState,
	executeTrack,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseTrackCommand,
	stateInitializationFingerprintOf,
} from "@autumn/balance-engine";
import { createPartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointLimitExceededError } from "../../../../src/state/checkpoint/restorePartitionCheckpoint.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../../src/state/sqliteBalanceStateStore.js";

const topic = "metering-events-v1";
const checkpointCreatedAt = 1_700_000_000_000;
const restoreLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

const identityOf = (customerId: string): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
});

const stateOf = ({
	identity,
	balance = 10,
}: {
	identity: MeteringIdentity;
	balance?: number;
}) =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

const checkpointWithReceipt = ({
	partition,
	identity,
	nextOffset = 2n,
}: {
	partition: number;
	identity: MeteringIdentity;
	nextOffset?: bigint;
}) => {
	const initialState = stateOf({ identity });
	const decision = computeTrack({
		state: initialState,
		deduplicationExpiresAt: checkpointCreatedAt + 86_400_000,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId: `cmd_${identity.customerId}`,
				requestId: `req_${identity.customerId}`,
				identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: checkpointCreatedAt,
			},
		}),
	});
	if (decision.kind !== "new") throw new Error("Expected a track outcome");
	const state = executeTrack({
		state: initialState,
		outcome: decision.outcome,
	}).state;
	const partitionKey = meteringPartitionKeyOf({ identity });
	const initializationId = `init_${identity.customerId}`;

	return createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: checkpointCreatedAt,
		topic,
		partition,
		nextOffset,
		states: [
			{
				partitionKey,
				initializationId,
				initializationFingerprint: stateInitializationFingerprintOf({
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId,
						initializedAt: checkpointCreatedAt,
						state: initialState,
					},
				}),
				state,
			},
		],
		receipts: [
			{
				partitionKey,
				recordOffset: nextOffset - 1n,
				outcome: decision.outcome,
			},
		],
	});
};

const checkpointWithoutReceipts = ({
	partition,
	identity,
	nextOffset,
}: {
	partition: number;
	identity: MeteringIdentity;
	nextOffset: bigint;
}) => {
	const state = stateOf({ identity });
	const partitionKey = meteringPartitionKeyOf({ identity });
	const initializationId = `init_${identity.customerId}`;
	return createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: checkpointCreatedAt,
		topic,
		partition,
		nextOffset,
		states: [
			{
				partitionKey,
				initializationId,
				initializationFingerprint: stateInitializationFingerprintOf({
					initialization: {
						schemaVersion: 1,
						type: "state_initialized",
						initializationId,
						initializedAt: checkpointCreatedAt,
						state,
					},
				}),
				state,
			},
		],
		receipts: [],
	});
};

const createStore = (): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-restore-"));
	return {
		directory,
		store: openSqliteBalanceStateStore({
			databasePath: join(directory, "balance-state.sqlite"),
		}),
	};
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

const resolverFor = (partitionByCustomerId: Record<string, number>) => ({
	partitionForIdentity: ({ identity }: { identity: MeteringIdentity }) => {
		const partition = partitionByCustomerId[identity.customerId];
		if (partition === undefined) throw new Error("Missing fixture partition");
		return partition;
	},
});

describe("restore partition checkpoint", () => {
	test("restores state, receipts, and progress into an absent partition", () => {
		const fixture = createStore();
		const identity = identityOf("cus_restore");
		const checkpoint = checkpointWithReceipt({
			partition: 0,
			identity,
		});
		try {
			fixture.store.restorePartitionCheckpoint({
				checkpoint,
				mode: "restore",
				limits: restoreLimits,
				partitionResolver: resolverFor({ cus_restore: 0 }),
			});

			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(2n);
			expect(fixture.store.readState({ identity })).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 5, usage: 5 }],
					},
				},
			});
			expect(
				fixture.store.readTrackReceipt({
					identity,
					commandId: `cmd_${identity.customerId}`,
				}),
			).toEqual(checkpoint.receipts[0]?.outcome);
		} finally {
			closeStore(fixture);
		}
	});

	test("replaces only the stale partition", () => {
		const fixture = createStore();
		const replacedIdentity = identityOf("cus_replaced");
		const retainedIdentity = identityOf("cus_retained");
		try {
			fixture.store.initializePartition({
				topic,
				partition: 0,
				nextOffset: 42n,
			});
			fixture.store.restoreState({
				topic,
				partition: 0,
				initializationId: "old_init",
				state: stateOf({ identity: replacedIdentity, balance: 3 }),
			});
			fixture.store.initializePartition({
				topic,
				partition: 1,
				nextOffset: 7n,
			});
			fixture.store.restoreState({
				topic,
				partition: 1,
				initializationId: "retained_init",
				state: stateOf({ identity: retainedIdentity, balance: 9 }),
			});

			fixture.store.restorePartitionCheckpoint({
				checkpoint: checkpointWithReceipt({
					partition: 0,
					identity: replacedIdentity,
					nextOffset: 100n,
				}),
				mode: "replace",
				limits: restoreLimits,
				partitionResolver: resolverFor({
					cus_replaced: 0,
					cus_retained: 1,
				}),
			});

			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(100n);
			expect(
				fixture.store.readState({ identity: replacedIdentity }),
			).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: { customerEntitlements: [{ balance: 5 }] },
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition: 1 })).toBe(7n);
			expect(
				fixture.store.readState({ identity: retainedIdentity }),
			).toMatchObject({
				featureStatesById: {
					messages: { customerEntitlements: [{ balance: 9 }] },
				},
			});
		} finally {
			closeStore(fixture);
		}
	});

	test("rolls back the old partition when a checkpoint insert fails", () => {
		const fixture = createStore();
		const oldIdentity = identityOf("cus_old");
		const conflictingIdentity = identityOf("cus_conflict");
		try {
			fixture.store.initializePartition({
				topic,
				partition: 0,
				nextOffset: 42n,
			});
			fixture.store.restoreState({
				topic,
				partition: 0,
				initializationId: "old_init",
				state: stateOf({ identity: oldIdentity, balance: 3 }),
			});
			fixture.store.initializePartition({
				topic,
				partition: 1,
				nextOffset: 7n,
			});
			fixture.store.restoreState({
				topic,
				partition: 1,
				initializationId: "conflicting_init",
				state: stateOf({ identity: conflictingIdentity }),
			});

			expect(() =>
				fixture.store.restorePartitionCheckpoint({
					checkpoint: checkpointWithoutReceipts({
						partition: 0,
						identity: conflictingIdentity,
						nextOffset: 100n,
					}),
					mode: "replace",
					limits: restoreLimits,
					partitionResolver: resolverFor({ cus_conflict: 0 }),
				}),
			).toThrow();
			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(42n);
			expect(fixture.store.readState({ identity: oldIdentity })).toMatchObject({
				featureStatesById: {
					messages: { customerEntitlements: [{ balance: 3 }] },
				},
			});
			expect(fixture.store.readNextOffset({ topic, partition: 1 })).toBe(7n);
		} finally {
			closeStore(fixture);
		}
	});

	test("rejects an oversized checkpoint before changing SQLite", () => {
		const fixture = createStore();
		const oldIdentity = identityOf("cus_old");
		const replacementIdentity = identityOf("cus_replacement");
		try {
			fixture.store.initializePartition({
				topic,
				partition: 0,
				nextOffset: 42n,
			});
			fixture.store.restoreState({
				topic,
				partition: 0,
				initializationId: "old_init",
				state: stateOf({ identity: oldIdentity }),
			});

			let error: unknown;
			try {
				fixture.store.restorePartitionCheckpoint({
					checkpoint: checkpointWithoutReceipts({
						partition: 0,
						identity: replacementIdentity,
						nextOffset: 100n,
					}),
					mode: "replace",
					limits: { ...restoreLimits, maxSerializedBytes: 1 },
					partitionResolver: resolverFor({ cus_replacement: 0 }),
				});
			} catch (cause) {
				error = cause;
			}

			expect(error).toBeInstanceOf(PartitionCheckpointLimitExceededError);
			expect(error).toMatchObject({
				limitName: "serialized_bytes",
				limit: 1,
			});
			expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(42n);
			expect(fixture.store.readState({ identity: oldIdentity })).not.toBeNull();
		} finally {
			closeStore(fixture);
		}
	});
});
