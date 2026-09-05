import type {
	KafkaConsumerGroupTimings,
	KafkaProducerFactory,
	KafkaProducerLimits,
} from "@autumn/kafka";
import type { PartitionReplay } from "../../kafka/meteringConsumer/types/partitionReplay.js";
import type {
	MeteringPartitionResolver,
	PartitionRuntime,
} from "../../runtime/types/partitionRuntime.js";
import type { SqliteBalanceStateStore } from "../../state/sqliteBalanceStateStore.js";
import type { PartitionTrackWriterLimits } from "../../writer/partitionTrackWriter.js";
export interface KafkaBalanceWorkerTimings extends KafkaConsumerGroupTimings {
	recoveryDrainTimeoutMs: number;
}
export type PartitionRuntimeFactoryContext = {
	kafka: KafkaProducerFactory;
	stateStore: SqliteBalanceStateStore;
	partitionResolver: MeteringPartitionResolver;
};
export type PartitionRuntimeFactoryConfig = {
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
