import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	type SubjectState,
} from "@autumn/balance-engine";
import { createPartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointLimitExceededError } from "../../../../src/state/actions/checkpoint/restorePartitionCheckpoint.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { StateStore } from "../../../../src/state/types/stateStore.js";
import {
	createState,
	createTrackMutation,
	seedSubjectState,
} from "../../../fixtures/mutations.js";

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
	entityId: null,
});

const stateOf = ({
	identity,
	balance = 10,
}: {
	identity: MeteringIdentity;
	balance?: number;
}): SubjectState => createState({ identity, balance });

/** Leaves the partition at `nextOffset` with the customer seeded by its initialize mutation. */
const seedPartition = ({
	store,
	partition,
	nextOffset,
	state,
	commandId,
}: {
	store: StateStore;
	partition: number;
	nextOffset: bigint;
	state: SubjectState;
	commandId: string;
}): void => {
	store.initializePartition({ topic, partition, nextOffset: nextOffset - 1n });
	seedSubjectState({
		store,
		topic,
		partition,
		offset: nextOffset - 1n,
		state,
		commandId,
	});
};

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
	const mutation = createTrackMutation({
		state: initialState,
		commandId: `cmd_${identity.customerId}`,
		occurredAt: checkpointCreatedAt,
		deduplicationExpiresAt: checkpointCreatedAt + 86_400_000,
	});
	const state = applyMutation({ state: initialState, mutation });
	const partitionKey = meteringPartitionKeyOf({ identity });

	return createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: checkpointCreatedAt,
		topic,
		partition,
		nextOffset,
		states: [{ subjectKey: partitionKey, state }],
		receipts: [{ partitionKey, recordOffset: nextOffset - 1n, mutation }],
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
	return createPartitionCheckpoint({
		engineSchemaVersion: 1,
		createdAt: checkpointCreatedAt,
		topic,
		partition,
		nextOffset,
		states: [{ subjectKey: partitionKey, state }],
		receipts: [],
	});
};

const createStore = (): {
	directory: string;
	store: StateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-restore-"));
	return {
		directory,
		store: openStateStore({
			databasePath: join(directory, "balance-state.sqlite"),
		}),
	};
};

const closeStore = ({
	directory,
	store,
}: {
	directory: string;
	store: StateStore;
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
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 5 }),
				]),
			});
			expect(
				fixture.store.readReceipt({
					identity,
					mutationId: `cmd_${identity.customerId}`,
				}),
			).toEqual(checkpoint.receipts[0]?.mutation);
		} finally {
			closeStore(fixture);
		}
	});

	test("replaces only the stale partition", () => {
		const fixture = createStore();
		const replacedIdentity = identityOf("cus_replaced");
		const retainedIdentity = identityOf("cus_retained");
		try {
			seedPartition({
				store: fixture.store,
				partition: 0,
				nextOffset: 42n,
				state: stateOf({ identity: replacedIdentity, balance: 3 }),
				commandId: "old_init",
			});
			seedPartition({
				store: fixture.store,
				partition: 1,
				nextOffset: 7n,
				state: stateOf({ identity: retainedIdentity, balance: 9 }),
				commandId: "retained_init",
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
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 5 }),
				]),
			});
			expect(fixture.store.readNextOffset({ topic, partition: 1 })).toBe(7n);
			expect(
				fixture.store.readState({ identity: retainedIdentity }),
			).toMatchObject({
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 9 }),
				]),
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
			seedPartition({
				store: fixture.store,
				partition: 0,
				nextOffset: 42n,
				state: stateOf({ identity: oldIdentity, balance: 3 }),
				commandId: "old_init",
			});
			seedPartition({
				store: fixture.store,
				partition: 1,
				nextOffset: 7n,
				state: stateOf({ identity: conflictingIdentity }),
				commandId: "conflicting_init",
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
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_monthly", balance: 3 }),
				]),
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
			seedPartition({
				store: fixture.store,
				partition: 0,
				nextOffset: 42n,
				state: stateOf({ identity: oldIdentity }),
				commandId: "old_init",
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
