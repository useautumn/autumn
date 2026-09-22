import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	MeteringIdentity,
	MutationRecord,
	SubjectState,
} from "@autumn/balance-engine";
import type { PartitionCheckpointSource } from "../../../src/checkpoint/partitionCheckpointSource.js";
import {
	type OwnedPartitionHealth,
	ownedPartitionHealthOf,
} from "../../../src/health/ownedPartitionHealth.js";
import { createPartitionBootstrapper } from "../../../src/runtime/bootstrap/createPartitionBootstrapper.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import type { SqliteStateStore } from "../../../src/state/types/stateStore.js";
import {
	createState as createSubjectStateFixture,
	createTrackMutation,
	testIdentity,
} from "../../fixtures/mutations.js";
export const identity = testIdentity;

export const topic = "metering-events-v1";
export const partition = 0;

export const createState = ({
	balance = 10,
	identity: stateIdentity = testIdentity,
}: {
	balance?: number;
	identity?: MeteringIdentity;
} = {}): SubjectState =>
	createSubjectStateFixture({ balance, identity: stateIdentity });

export const createMutation = ({
	state,
	commandId = "cmd_1",
	requestId = "req_1",
}: {
	state: SubjectState;
	commandId?: string;
	requestId?: string;
}): MutationRecord => createTrackMutation({ state, commandId, requestId });

export const createStoreFixture = ({
	nextOffset = 0n,
}: {
	nextOffset?: bigint;
} = {}): {
	directory: string;
	store: SqliteStateStore;
} => {
	const directory = mkdtempSync(join(tmpdir(), "autumn-kafka-consumer-"));
	const store = openStateStore({
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
	store: SqliteStateStore;
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
import type { Consumer } from "kafkajs";
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
import { createMutationPublisher } from "../../../src/kafka/createMutationPublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createPartitionReplay } from "../../../src/kafka/meteringConsumer/replay/createPartitionReplay.js";
import type { PartitionReplayContext } from "../../../src/kafka/meteringConsumer/types/partitionReplay.js";
import type { ReplayWindow } from "../../../src/kafka/meteringConsumer/types/replayWindow.js";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import type {
	PartitionRuntimeConfig,
	PartitionRuntimeDependencies,
} from "../../../src/runtime/types/partitionRuntime.js";

// Keep Owen's scenarios intact while adapting construction to the new component boundaries.
export function createKafkaOwnedPartitionGroup(
	params: Omit<
		WorkerPartitionsContext,
		"createRuntime" | "onUnhealthyPartition"
	> &
		Omit<WorkerPartitionsConfig, "healthRefreshIntervalMs"> & {
			createRuntime: KafkaPartitionRuntimeFactory;
			healthRefreshIntervalMs?: number;
			onUnhealthyPartition?: WorkerPartitionsContext["onUnhealthyPartition"];
		},
) {
	const {
		topic,
		partitionsConsumedConcurrently,
		healthRefreshIntervalMs = 60_000,
		partitionBootstrapRetryIntervalMs,
		onUnhealthyPartition = ignoreUnhealthy,
		createRuntime: factory,
		...dependencies
	} = params;
	function createRuntime(input: Parameters<KafkaPartitionRuntimeFactory>[0]) {
		const runtime = factory(input);
		async function waitForQuiescence(): Promise<void> {
			await runtime.waitForQuiescence?.();
		}
		function getHealth(): OwnedPartitionHealth {
			return (
				runtime.getHealth?.() ??
				ownedPartitionHealthOf({
					topic,
					partition: input.partition,
					status: "ready",
					localNextOffset: 0n,
					consumedNextOffset: 0n,
					highWatermark: 0n,
					failureReason: null,
				})
			);
		}
		async function drain(): Promise<void> {}
		function subscribeUnavailable(): () => void {
			return ignoreUnhealthy;
		}
		async function claim(): Promise<{ routeEpoch: string }> {
			return { routeEpoch: "0" };
		}
		async function release(): Promise<void> {}
		async function process(): Promise<never> {
			throw new Error("Not used by group fixture");
		}
		return {
			runtime: {
				drain,
				subscribeUnavailable,
				process,
				...runtime,
				waitForQuiescence,
				getHealth,
			},
			publication: { claim, release },
		};
	}
	return createWorkerPartitions({
		ctx: { ...dependencies, createRuntime, onUnhealthyPartition },
		config: {
			topic,
			partitionsConsumedConcurrently,
			healthRefreshIntervalMs,
			partitionBootstrapRetryIntervalMs,
		},
	});
}
export type KafkaOwnedPartitionGroupConsumerPort = KafkaConsumerClient;
export type KafkaPartitionRuntimeFactory = (
	input: Parameters<WorkerPartitionsContext["createRuntime"]>[0],
) => {
	start(): Promise<void>;
	stop(): Promise<void>;
	waitForQuiescence?(): Promise<void>;
	getHealth?(): OwnedPartitionHealth;
};
export type KafkaPartitionControlPort = Pick<
	Consumer,
	"pause" | "resume" | "seek"
>;

export function createKafkaOwnedPartitionRuntimeFactory(
	params: Omit<
		PartitionRuntimeFactoryContext,
		"ownershipOffsets" | "db" | "catalogCache" | "bootstrapper"
	> & {
		stateStore: SqliteStateStore;
		checkpointSource: PartitionCheckpointSource;
	} & Partial<Pick<PartitionRuntimeFactoryContext, "db" | "catalogCache">> &
		Omit<PartitionRuntimeFactoryConfig, "ownership">,
) {
	const {
		kafka,
		stateStore,
		partitionResolver,
		checkpointSource,
		db = createSyntheticWorkerDb(),
		catalogCache = createTestCatalogCache(),
		...config
	} = params;
	async function fetchTopicOffsets() {
		return [{ partition: 0, offset: "0", low: "0", high: "0" }];
	}
	const factory = createPartitionRuntimeFactory({
		ctx: {
			kafka,
			stateStore,
			db,
			catalogCache,
			partitionResolver,
			bootstrapper: createPartitionBootstrapper({
				stateStore,
				checkpointSource,
				partitionResolver,
				restoreLimits: config.checkpointRestoreLimits,
				retryPolicy: config.checkpointRetryPolicy,
			}),
			ownershipOffsets: { fetchTopicOffsets },
		},
		config: {
			...config,
			ownership: { topic: "test-ownership", endpoint: "http://localhost" },
		},
	});
	function createRuntime(input: Parameters<typeof factory>[0]) {
		return factory(input).runtime;
	}
	return createRuntime;
}
export function createKafkaPartitionOutcomeFollower({
	assignedPartition = partition,
	consumer,
	partitionOffsets,
	stateStore,
	positionTracker,
	replayWindow = { windowMs: 600_000, lookupTimeoutMs: 50, now: () => 0 },
	replayFloorByPartition = new Map(),
}: {
	assignedPartition?: number;
	consumer: KafkaPartitionControlPort;
	partitionOffsets: PartitionReplayContext["partitionOffsets"];
	stateStore: Pick<SqliteStateStore, "readNextOffset">;
	positionTracker: ProgressTracker;
	replayWindow?: ReplayWindow;
	replayFloorByPartition?: Map<number, bigint>;
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
		position: { topic, partition: assignedPartition },
		ctx: {
			partitionOffsets,
			stateStore,
			positionTracker,
			replayWindow,
			replayFloorByPartition,
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
export function createKafkaCommittedMutationAppender({
	producer,
}: {
	producer: KafkaProducerClient;
}) {
	return createMutationPublisher({ ctx: { producer } });
}
export function serializeKafkaMutationRecord({
	mutation,
}: {
	mutation: MutationRecord;
}) {
	return serializeMeteringRecord({ record: mutation });
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
			appender: createMutationPublisher({
				ctx: { producer: ctx.producer },
			}),
		},
		config: { topic, partition, writerLimits, recoveryDrainTimeoutMs },
	});
}

function ignoreUnhealthy(): void {}

import type {
	PartitionRuntimePort,
	PartitionRuntimeResources,
} from "../../../src/partitions/types/partitions.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";

export type LifecycleTestRuntime = Pick<
	PartitionRuntimePort,
	"start" | "stop" | "getHealth"
>;

export const createTestRuntimeResources = ({
	runtime,
	markUnavailable = () => undefined,
}: {
	runtime: LifecycleTestRuntime;
	markUnavailable?: PartitionRuntimeResources["markUnavailable"];
}): PartitionRuntimeResources => {
	const drain = async (): Promise<void> => undefined;
	const subscribeUnavailable: PartitionRuntimePort["subscribeUnavailable"] =
		() => () =>
			undefined;
	const process: PartitionRuntimePort["process"] = async () => {
		throw new Error("Lifecycle fixture cannot execute commands");
	};
	const claim = async () => ({ routeEpoch: "1" });
	const release = async (): Promise<void> => undefined;
	return {
		runtime: {
			...runtime,
			drain,
			waitForQuiescence: drain,
			subscribeUnavailable,
			process,
		},
		publication: { claim, release },
		markUnavailable,
	};
};
