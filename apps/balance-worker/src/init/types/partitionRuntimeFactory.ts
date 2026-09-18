import type {
	KafkaConsumerGroupTimings,
	KafkaProducerFactory,
	KafkaProducerLimits,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { Admin } from "kafkajs";
import type { CatalogCache } from "../../catalog/types/catalogCache.js";
import type { PartitionCheckpointMaintenance } from "../../checkpoint/scheduling/partitionCheckpointMaintenance.js";
import type { PartitionOwnershipPublication } from "../../partitions/types/partitions.js";
import type { PartitionWriterLimits } from "../../processor/writer/types/partitionWriter.js";
import type {
	PartitionBootstrapper,
	PartitionBootstrapRetryPolicy,
} from "../../runtime/bootstrap/types/partitionBootstrap.js";
import type {
	MeteringPartitionResolver,
	PartitionOutcomeFollowerPort,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";
import type { PartitionCheckpointRestoreLimits } from "../../state/actions/checkpoint/restorePartitionCheckpoint.js";
import type { StateStore } from "../../state/types/stateStore.js";
import type { WorkerDb } from "../../types/workerDb.js";

export type KafkaBalanceWorkerTimings = KafkaConsumerGroupTimings & {
	healthRefreshIntervalMs: number;
	recoveryDrainTimeoutMs: number;
};

export type PartitionRuntimeFactoryInput = {
	topic: string;
	partition: number;
	follower: PartitionOutcomeFollowerPort;
};

export type ConstructedPartitionRuntime = {
	runtime: PartitionRuntime;
	publication: PartitionOwnershipPublication;
};

export type KafkaOwnedPartitionRuntimeFactory = (
	position: PartitionRuntimeFactoryInput,
) => ConstructedPartitionRuntime;

export type PartitionRuntimeFactoryContext = {
	logger?: Pick<AutumnLogger, "info" | "warn">;
	kafka: KafkaProducerFactory;
	ownershipOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: StateStore;
	db: WorkerDb;
	catalogCache: CatalogCache;
	/** Built beside the store: checkpoint restore for sqlite, the Postgres bookmark for postgres. */
	bootstrapper: PartitionBootstrapper;
	checkpointMaintenance?: PartitionCheckpointMaintenance;
	partitionResolver: MeteringPartitionResolver;
};

export type PartitionRuntimeFactoryConfig = {
	deploymentEnvironment: string;
	ownership: { topic: string; endpoint: string };
	checkpointRestoreLimits: PartitionCheckpointRestoreLimits;
	checkpointRetryPolicy: PartitionBootstrapRetryPolicy;
	writerLimits: PartitionWriterLimits;
	trackReceiptRetentionMs: number;
	producerLimits: KafkaProducerLimits;
	timings: KafkaBalanceWorkerTimings;
};
