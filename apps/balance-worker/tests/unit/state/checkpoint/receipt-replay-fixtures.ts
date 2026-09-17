import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MeteringIdentity, MutationRecord } from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { createPartitionProcessor } from "../../../../src/processor/createPartitionProcessor.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { StateStore } from "../../../../src/state/types/stateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import {
	applyDurableMutation,
	createCustomerEntitlement,
	createInitializeMutation,
	createState,
	createTrackCommand,
} from "../../../fixtures/mutations.js";

export const topic = "metering-receipt-replay";
export const partition = 0;
export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
} as const;
export const checkpointLimits = {
	maxSerializedBytes: 1_000_000,
	maxStates: 100,
	maxReceipts: 1_000,
};

export const createCommand = ({
	commandId = "cmd_reused",
	value = 5,
}: {
	commandId?: string;
	value?: number;
} = {}) => createTrackCommand({ identity, commandId, value });

/** The reply carries the result only; the record it came from is in the store. */
const recordOf = ({
	store,
	identity,
	commandId,
}: {
	store: StateStore;
	identity: MeteringIdentity;
	commandId: string;
}): MutationRecord => {
	const record = store.readReceipt({ identity, mutationId: commandId });
	if (!record) throw new Error(`No receipt for ${commandId}`);
	return record;
};

export const createReceiptReplayFixture = async ({
	checkpointCut = "before_expiry",
}: {
	checkpointCut?: "before_first_track" | "before_expiry" | "after_expiry";
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-receipt-replay-"));
	const liveStore = openStateStore({
		databasePath: join(directory, "live.sqlite"),
	});
	const restoredStore = openStateStore({
		databasePath: join(directory, "restored.sqlite"),
	});
	let now = 1_700_000_000_000;
	const baselineState = createState({
		identity,
		customerEntitlements: [
			createCustomerEntitlement({
				externalId: "monthly-grant",
				balance: 10,
			}),
		],
	});
	const initialization = createInitializeMutation({
		state: baselineState,
		occurredAt: now,
		deduplicationExpiresAt: now + 86_400_000,
	});
	const records: MeteringRecord[] = [initialization];
	const appender = {
		appendCommitted: async ({
			outcomes,
		}: {
			outcomes: readonly MeteringRecord[];
		}) => {
			const baseOffset = BigInt(records.length);
			records.push(...outcomes);
			return { baseOffset };
		},
	};
	const createProcessor = ({ stateStore }: { stateStore: StateStore }) =>
		createPartitionProcessor({
			ctx: {
				stateStore,
				appender,
				db: createSyntheticWorkerDb(),
				catalogCache: createTestCatalogCache(),
				receiptPolicy: { retentionMs: 86_400_000, now: () => now },
				assertCanRead: () => {},
			},
			config: {
				topic,
				partition,
				writerLimits: {
					maxBatchSize: 10,
					maxPendingCommands: 10,
					maxPendingCommandsPerCustomer: 10,
				},
			},
		});
	const liveProcessor = createProcessor({ stateStore: liveStore });
	const restoredProcessor = createProcessor({ stateStore: restoredStore });
	const close = async () => {
		await Promise.all([liveProcessor.drain(), restoredProcessor.drain()]);
		liveStore.close();
		restoredStore.close();
		rmSync(directory, { recursive: true, force: true });
	};
	const capture = () =>
		parsePartitionCheckpoint({
			input: liveStore.capturePartitionCheckpoint({
				topic,
				partition,
				createdAt: now,
				limits: checkpointLimits,
			}).serialized,
		});

	try {
		liveStore.initializePartition({ topic, partition, nextOffset: 0n });
		applyDurableMutation({
			store: liveStore,
			topic,
			partition,
			offset: 0n,
			mutation: initialization,
		});
		let checkpoint = checkpointCut === "before_first_track" ? capture() : null;
		const firstCommand = createCommand();
		await liveProcessor.track({ command: firstCommand });
		const firstMutation = recordOf({
			store: liveStore,
			identity,
			commandId: firstCommand.commandId,
		});
		if (checkpointCut === "before_expiry") checkpoint = capture();
		now = firstMutation.receipt.expiresAt;
		if (checkpointCut === "after_expiry") checkpoint = capture();
		if (!checkpoint) throw new Error("Expected a checkpoint cut");
		const pruned = liveStore.pruneExpiredReceipts({
			topic,
			partition,
			expiresAtOrBefore: now,
			limit: 2,
		});
		// Same request, recomputed after the owner pruned its receipt.
		const reusedCommand = createCommand();
		await liveProcessor.track({ command: reusedCommand });
		const reusedMutation = recordOf({
			store: liveStore,
			identity,
			commandId: reusedCommand.commandId,
		});
		restoredStore.restorePartitionCheckpoint({
			checkpoint,
			mode: "restore",
			limits: checkpointLimits,
			partitionResolver: { partitionForIdentity: () => partition },
		});
		const tail = records.flatMap((mutation, index) =>
			BigInt(index) < checkpoint.nextOffset
				? []
				: [{ position: { topic, partition, offset: BigInt(index) }, mutation }],
		);
		return {
			initialization,
			baselineState,
			liveStore,
			restoredStore,
			restoredProcessor,
			checkpoint,
			firstMutation,
			reusedCommand,
			reusedMutation,
			tail,
			records,
			pruned,
			now,
			close,
		};
	} catch (cause) {
		await close();
		throw cause;
	}
};
