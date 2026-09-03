import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CustomerMeteringState,
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import {
	openSqliteBalanceStateStore,
	type SqliteBalanceStateStore,
} from "../../../src/state/sqliteBalanceStateStore.js";

export const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
} as const;

export const topic = "metering-events-v1";
export const partition = 0;

export const createState = ({
	balance = 10,
}: {
	balance?: number;
} = {}): CustomerMeteringState =>
	createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [{ id: "messages_monthly", balance, usage: 0 }],
			},
		},
	});

export const createOutcome = ({
	state,
	commandId = "cmd_1",
	requestId = "req_1",
}: {
	state: CustomerMeteringState;
	commandId?: string;
	requestId?: string;
}): TrackOutcome => {
	const decision = computeTrack({
		state,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId,
				identity: state.identity,
				entityId: null,
				featureId: "messages",
				value: 5,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
				deduplicationExpiresAt: 1_700_086_400_000,
			},
		}),
	});

	if (decision.kind !== "new") {
		throw new Error(`Expected a new outcome, received ${decision.kind}`);
	}
	return decision.outcome;
};

export const createStoreFixture = ({
	nextOffset = 0n,
}: {
	nextOffset?: bigint;
} = {}): {
	directory: string;
	store: SqliteBalanceStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-kafka-consumer-"));
	const store = openSqliteBalanceStateStore({
		databasePath: join(directory, "balance-state.sqlite"),
	});

	try {
		store.initializePartition({ topic, partition, nextOffset });
		return { directory, store };
	} catch (error) {
		store.close();
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
};

export const closeStoreFixture = ({
	directory,
	store,
}: {
	directory: string;
	store: SqliteBalanceStateStore;
}): void => {
	store.close();
	rmSync(directory, { recursive: true, force: true });
};

import {
	createProducerSession,
	type KafkaConsumerClient,
	type KafkaProducerClient,
	type KafkaProducerFactory,
	type KafkaProducerLimits,
	type ProgressTracker,
	serializeMeteringRecord,
} from "@autumn/kafka";
import type { Admin, Consumer } from "kafkajs";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import type {
	PartitionRuntimeFactoryConfig,
	PartitionRuntimeFactoryContext,
} from "../../../src/init/types/partitionRuntimeFactory.js";
import type {
	WorkerPartitionsConfig,
	WorkerPartitionsContext,
} from "../../../src/init/types/workerPartitions.js";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createPartitionReplay } from "../../../src/kafka/meteringConsumer/replay/createPartitionReplay.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import type {
	PartitionRuntimeConfig,
	PartitionRuntimeDependencies,
} from "../../../src/runtime/types/partitionRuntime.js";

// Keep Owen's scenarios intact while adapting construction to the new component boundaries.
export function createKafkaOwnedPartitionGroup(
	params: Omit<WorkerPartitionsContext, "createRuntime"> &
		WorkerPartitionsConfig & { createRuntime: KafkaPartitionRuntimeFactory },
) {
	const {
		topic,
		partitionsConsumedConcurrently,
		createRuntime: factory,
		...dependencies
	} = params;
	function createRuntime(input: Parameters<KafkaPartitionRuntimeFactory>[0]) {
		const runtime = factory(input);
		async function waitForQuiescence(): Promise<void> {
			await runtime.waitForQuiescence?.();
		}
		return { ...runtime, waitForQuiescence };
	}
	return createWorkerPartitions({
		ctx: { ...dependencies, createRuntime },
		config: { topic, partitionsConsumedConcurrently },
	});
}
export type KafkaOwnedPartitionGroupConsumerPort = KafkaConsumerClient;
export type KafkaPartitionRuntimeFactory = (
	input: Parameters<WorkerPartitionsContext["createRuntime"]>[0],
) => {
	start(): Promise<void>;
	stop(): Promise<void>;
	waitForQuiescence?(): Promise<void>;
};
export type KafkaPartitionControlPort = Pick<
	Consumer,
	"pause" | "resume" | "seek"
>;

export function createKafkaOwnedPartitionRuntimeFactory(
	params: PartitionRuntimeFactoryContext & PartitionRuntimeFactoryConfig,
) {
	const { kafka, stateStore, partitionResolver, ...config } = params;
	return createPartitionRuntimeFactory({
		ctx: { kafka, stateStore, partitionResolver },
		config,
	});
}
export function createKafkaPartitionOutcomeFollower({
	consumer,
	partitionOffsets,
	stateStore,
	positionTracker,
}: {
	consumer: KafkaPartitionControlPort;
	partitionOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: Pick<SqliteBalanceStateStore, "readNextOffset">;
	positionTracker: ProgressTracker;
}) {
	async function withdrawPartition(): Promise<void> {}
	function resumePartition(): void {}
	function seekPartition({
		partition,
		nextOffset,
	}: {
		partition: number;
		nextOffset: bigint;
	}): void {
		consumer.seek({ topic, partition, offset: nextOffset.toString() });
	}
	function pausePartition({ partition }: { partition: number }): void {
		consumer.pause([{ topic, partitions: [partition] }]);
	}
	function resumeFetching({ partition }: { partition: number }): void {
		consumer.resume([{ topic, partitions: [partition] }]);
	}
	return createPartitionReplay({
		ctx: {
			partitionOffsets,
			stateStore,
			positionTracker,
			consumption: {
				withdrawPartition,
				resumePartition,
				seekPartition,
				pausePartition,
				resumeFetching,
			},
		},
	});
}
export function createKafkaOwnedPartitionProducer({
	kafka,
	...params
}: {
	kafka: KafkaProducerFactory;
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaProducerLimits;
}) {
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig(params),
	});
	return createWorkerProducer({ ctx: { session }, config: params });
}
export function createKafkaCommittedTrackOutcomeAppender({
	producer,
}: {
	producer: KafkaProducerClient;
}) {
	return createTrackOutcomePublisher({ ctx: { producer } });
}
export function serializeKafkaTrackOutcomeRecord({
	outcome,
}: {
	outcome: TrackOutcome;
}) {
	return serializeMeteringRecord({ record: outcome });
}
export function createOwnedPartitionRuntime(
	params: Omit<PartitionRuntimeDependencies, "appender"> &
		PartitionRuntimeConfig & {
			producer: KafkaProducerClient & PartitionRuntimeDependencies["producer"];
		},
) {
	const { topic, partition, writerLimits, recoveryDrainTimeoutMs, ...ctx } =
		params;
	return createPartitionRuntime({
		ctx: {
			...ctx,
			appender: createTrackOutcomePublisher({
				ctx: { producer: ctx.producer },
			}),
		},
		config: { topic, partition, writerLimits, recoveryDrainTimeoutMs },
	});
}
