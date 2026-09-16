import type {
	KafkaConsumerGroupTimings,
	KafkaProducerFactory,
	KafkaProducerLimits,
} from "@autumn/kafka";
import type { PartitionCheckpointSource } from "../../checkpoint/partitionCheckpointSource.js";
import type { PartitionReplay } from "../../kafka/meteringConsumer/types/partitionReplay.js";
import type { PartitionBootstrapRetryPolicy } from "../../runtime/bootstrap/types/partitionBootstrap.js";
import type {
	MeteringPartitionResolver,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";
import type { PartitionCheckpointRestoreLimits } from "../../state/checkpoint/restorePartitionCheckpoint.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { PartitionTrackWriterLimits } from "../../writer/partitionTrackWriter.js";
export interface KafkaBalanceWorkerTimings extends KafkaConsumerGroupTimings {
	recoveryDrainTimeoutMs: number;
	healthRefreshIntervalMs: number;
}
export type PartitionRuntimeFactoryContext = {
	checkpointSource: PartitionCheckpointSource;
	kafka: KafkaProducerFactory;
	stateStore: SqliteBalanceStateStore;
	partitionResolver: MeteringPartitionResolver;
};
export type PartitionRuntimeFactoryConfig = {
	checkpointRestoreLimits: PartitionCheckpointRestoreLimits;
	checkpointRetryPolicy: PartitionBootstrapRetryPolicy;
	trackReceiptRetentionMs: number;
	deploymentEnvironment: string;
	writerLimits: PartitionTrackWriterLimits;
	producerLimits: KafkaProducerLimits;
	timings: KafkaBalanceWorkerTimings;
};
export type PartitionRuntimeFactoryInput = {
	topic: string;
	partition: number;
	follower: PartitionReplay;
};
export type PartitionRuntimeFactory = (
	input: PartitionRuntimeFactoryInput,
) => PartitionRuntime;
