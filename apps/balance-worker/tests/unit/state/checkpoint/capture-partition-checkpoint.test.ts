import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyMutation,
	type MutationRecord,
	type SubjectState,
} from "@autumn/balance-engine";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { planPartitionBootstrap } from "../../../../src/runtime/bootstrap/plan/planPartitionBootstrap.js";
import { PartitionCheckpointLimitExceededError } from "../../../../src/state/actions/checkpoint/restorePartitionCheckpoint.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../../src/state/types/stateStore.js";
import {
	applyDurableMutation,
	createInitializeMutation,
	createState,
	createTrackMutation,
} from "../../../fixtures/mutations.js";

const topic = "metering-events-v1";
const partition = 0;
const checkpointCreatedAt = 1_700_000_000_000;
const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
} as const;
const limits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

const createStore = (): {
	directory: string;
	store: SqliteStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-checkpoint-capture-"));
	const store = openStateStore({
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
	store: SqliteStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

const mutationFor = ({
	state,
	commandId,
	deduplicationExpiresAt,
}: {
	state: SubjectState;
	commandId: string;
	deduplicationExpiresAt: number;
}): MutationRecord =>
	createTrackMutation({
		state,
		commandId,
		value: 1,
		occurredAt: checkpointCreatedAt - 1,
		deduplicationExpiresAt,
	});

const emptyState = ({
	customerId = identity.customerId as string,
}: {
	customerId?: string;
} = {}): SubjectState =>
	createState({
		identity: { ...identity, customerId },
		customerEntitlements: [],
	});

describe("capture partition checkpoint", () => {
	test("does not rewind locally applied progress to a lagging follower", () => {
		const fixture = createStore();
		try {
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 5n,
				mutation: createInitializeMutation({
					state: emptyState(),
					commandId: "init_ahead_of_follower",
					occurredAt: checkpointCreatedAt - 1,
				}),
			});
			const checkpoint = fixture.store.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt: checkpointCreatedAt,
				limits,
				consumedNextOffset: 2n,
			});
			expect(checkpoint.nextOffset).toBe(6n);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(6n);
			expect(() =>
				fixture.store.capturePartitionCheckpoint({
					topic,
					partition,
					createdAt: checkpointCreatedAt,
					limits,
					consumedNextOffset: -1n,
				}),
			).toThrow(RangeError);
		} finally {
			closeStore(fixture);
		}
	});

	test("preserves a verified marker-only replay position in a read-only checkpoint", () => {
		const fixture = createStore();
		try {
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: createInitializeMutation({
					state: emptyState(),
					commandId: "init_before_marker",
					occurredAt: checkpointCreatedAt - 1,
				}),
			});

			const checkpoint = fixture.store.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt: checkpointCreatedAt,
				limits,
				consumedNextOffset: 2n,
			});

			expect(checkpoint.nextOffset).toBe(2n);
			expect(checkpoint).toHaveProperty("serialized", expect.any(String));
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(1n);
			expect(
				planPartitionBootstrap({
					localNextOffset: null,
					checkpoint: parsePartitionCheckpoint({
						input: checkpoint.serialized,
					}),
					logRange: { logStartOffset: 2n, logEndOffset: 2n },
				}).kind,
			).toBe("restore");
		} finally {
			closeStore(fixture);
		}
	});

	test("captures one read-only cut and filters receipts using its createdAt", () => {
		const fixture = createStore();
		try {
			const initialization = createInitializeMutation({
				state: createState({ identity }),
				commandId: "init_1",
				occurredAt: checkpointCreatedAt - 10,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: initialization,
			});
			const initialState = applyMutation({
				state: null,
				mutation: initialization,
			});
			const expiredMutation = mutationFor({
				state: initialState,
				commandId: "cmd_expired",
				deduplicationExpiresAt: checkpointCreatedAt,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation: expiredMutation,
			});
			const retainedMutation = mutationFor({
				state: applyMutation({
					state: initialState,
					mutation: expiredMutation,
				}),
				commandId: "cmd_retained",
				deduplicationExpiresAt: checkpointCreatedAt + 1,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 2n,
				mutation: retainedMutation,
			});

			const checkpoint = fixture.store.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt: checkpointCreatedAt,
				limits,
			});

			expect(
				parsePartitionCheckpoint({ input: checkpoint.serialized }),
			).toMatchObject({
				createdAt: checkpointCreatedAt,
				nextOffset: 3n,
				states: [{ state: { revision: 3 } }],
				receipts: [
					{ recordOffset: 0n, mutation: { id: "init_1" } },
					{ recordOffset: 2n, mutation: { id: "cmd_retained" } },
				],
			});
			expect(
				fixture.store.readReceipt({ identity, mutationId: "cmd_expired" }),
			).toEqual(expiredMutation);
		} finally {
			closeStore(fixture);
		}
	});

	test("refuses a cut that exceeds its state or serialized-size limits", () => {
		const fixture = createStore();
		try {
			for (const [offset, customerId] of ["cus_1", "cus_2"].entries()) {
				applyDurableMutation({
					store: fixture.store,
					topic,
					partition,
					offset: BigInt(offset),
					mutation: createInitializeMutation({
						state: emptyState({ customerId }),
						commandId: `init_${customerId}`,
						occurredAt: checkpointCreatedAt - 1,
					}),
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
			const initialization = createInitializeMutation({
				state: createState({ identity }),
				commandId: "init_1",
				occurredAt: checkpointCreatedAt - 10,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 0n,
				mutation: initialization,
			});
			const initialState = applyMutation({
				state: null,
				mutation: initialization,
			});
			const oldestMutation = mutationFor({
				state: initialState,
				commandId: "cmd_oldest",
				deduplicationExpiresAt: checkpointCreatedAt - 2,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 1n,
				mutation: oldestMutation,
			});
			const newerMutation = mutationFor({
				state: applyMutation({
					state: initialState,
					mutation: oldestMutation,
				}),
				commandId: "cmd_newer",
				deduplicationExpiresAt: checkpointCreatedAt - 1,
			});
			applyDurableMutation({
				store: fixture.store,
				topic,
				partition,
				offset: 2n,
				mutation: newerMutation,
			});

			expect(
				fixture.store.pruneExpiredReceipts({
					topic,
					partition,
					expiresAtOrBefore: checkpointCreatedAt,
					limit: 1,
				}),
			).toEqual({ deletedCount: 1 });
			expect(
				fixture.store.readReceipt({ identity, mutationId: "cmd_oldest" }),
			).toBeNull();
			expect(
				fixture.store.readReceipt({ identity, mutationId: "cmd_newer" }),
			).toEqual(newerMutation);
			expect(fixture.store.readNextOffset({ topic, partition })).toBe(3n);
			expect(fixture.store.readState({ identity })?.revision).toBe(3);
		} finally {
			closeStore(fixture);
		}
	});
});
