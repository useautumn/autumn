import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	CustomerStateMutation,
	TrackDecision,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { createPartitionProcessor } from "../../../../src/processor/createPartitionProcessor.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { StateStore } from "../../../../src/state/types/stateStore.js";
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

const requireNewMutation = ({
	decision,
}: {
	decision: TrackDecision;
}): CustomerStateMutation => {
	if (decision.kind !== "new") throw new Error("Expected a new track mutation");
	return decision.mutation;
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
				planId: "pro",
				balance: 10,
				reset: {
					interval: "month",
					intervalCount: 1,
					nextResetAt: 1_800_000_000_000,
				},
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
				trackReceiptPolicy: { retentionMs: 86_400_000, now: () => now },
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
		const firstMutation = requireNewMutation({
			decision: await liveProcessor.track({ command: createCommand() }),
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
		const reusedMutation = requireNewMutation({
			decision: await liveProcessor.track({ command: reusedCommand }),
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
