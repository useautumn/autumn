import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
	type StateInitializedEvent,
	type TrackDecision,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import { createPartitionProcessor } from "../../../../src/processor/createPartitionProcessor.js";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../../src/state/sqliteBalanceStateStore.js";

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
} = {}) =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId,
			requestId: `req_${commandId}`,
			identity,
			entityId: null,
			featureId: "messages",
			value,
			overageBehavior: "reject",
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

const requireNewOutcome = ({ decision }: { decision: TrackDecision }) => {
	if (decision.kind !== "new") throw new Error("Expected a new track outcome");
	return decision.outcome;
};

export const createReceiptReplayFixture = async ({
	checkpointCut = "before_expiry",
}: {
	checkpointCut?: "before_first_track" | "before_expiry" | "after_expiry";
} = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-receipt-replay-"));
	const liveStore = openSqliteBalanceStateStore({
		databasePath: join(directory, "live.sqlite"),
	});
	const restoredStore = openSqliteBalanceStateStore({
		databasePath: join(directory, "restored.sqlite"),
	});
	let now = 1_700_000_000_000;
	const initialization: StateInitializedEvent = {
		schemaVersion: 1,
		type: "state_initialized",
		initializationId: "init_1",
		initializedAt: now,
		state: createCustomerMeteringState({
			identity,
			featureStatesById: {
				messages: {
					kind: "direct_metered_v1",
					customerEntitlements: [
						{
							id: "messages_monthly",
							externalId: "monthly-grant",
							balance: 10,
							usage: 0,
							granted: 10,
							planId: "pro",
							reset: {
								interval: "month",
								intervalCount: 1,
								nextResetAt: 1_800_000_000_000,
							},
							expiresAt: null,
						},
					],
				},
			},
		}),
	};
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
	const createProcessor = ({
		stateStore,
	}: {
		stateStore: SqliteBalanceStateStore;
	}) =>
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
		liveStore.applyDurableStateInitialization({
			position: { topic, partition, offset: 0n },
			initialization,
		});
		let checkpoint = checkpointCut === "before_first_track" ? capture() : null;
		const firstOutcome = requireNewOutcome({
			decision: await liveProcessor.track({ command: createCommand() }),
		});
		if (checkpointCut === "before_expiry") checkpoint = capture();
		now = firstOutcome.deduplicationExpiresAt;
		if (checkpointCut === "after_expiry") checkpoint = capture();
		if (!checkpoint) throw new Error("Expected a checkpoint cut");
		const pruned = liveStore.pruneExpiredTrackReceipts({
			topic,
			partition,
			expiresAtOrBefore: now,
			limit: 1,
		});
		const reusedCommand = createCommand({ value: 3 });
		const reusedOutcome = requireNewOutcome({
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
			liveStore,
			restoredStore,
			restoredProcessor,
			checkpoint,
			firstOutcome,
			reusedCommand,
			reusedOutcome,
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
