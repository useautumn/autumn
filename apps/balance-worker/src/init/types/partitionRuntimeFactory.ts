import type {
	KafkaConsumerGroupTimings,
	KafkaProducerFactory,
	KafkaProducerLimits,
} from "@autumn/kafka";
import type { Admin } from "kafkajs";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { PartitionOwnershipPublication } from "../../partitions/types/partitions.js";
import type { PartitionBootstrapRetryPolicy } from "../../runtime/bootstrap/types/partitionBootstrap.js";
import type {
	MeteringPartitionResolver,
	PartitionOutcomeFollowerPort,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";
import type { PartitionCheckpointRestoreLimits } from "../../state/checkpoint/restorePartitionCheckpoint.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { PartitionTrackWriterLimits } from "../../writer/partitionTrackWriter.js";

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
	kafka: KafkaProducerFactory;
	ownershipOffsets: Pick<Admin, "fetchTopicOffsets">;
	stateStore: SqliteBalanceStateStore;
	checkpointSource: PartitionCheckpointSource;
	partitionResolver: MeteringPartitionResolver;
};

export type PartitionRuntimeFactoryConfig = {
	deploymentEnvironment: string;
	ownership: { topic: string; endpoint: string };
	checkpointRestoreLimits: PartitionCheckpointRestoreLimits;
	checkpointRetryPolicy: PartitionBootstrapRetryPolicy;
	writerLimits: PartitionTrackWriterLimits;
	trackReceiptRetentionMs: number;
	producerLimits: KafkaProducerLimits;
	timings: KafkaBalanceWorkerTimings;
};
