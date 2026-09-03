import {
	createOwnedPartitionRuntime,
	type MeteringPartitionResolver,
} from "../runtime/ownedPartitionRuntime.js";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import type { PartitionTrackWriterLimits } from "../writer/partitionTrackWriter.js";
import type { KafkaPartitionRuntimeFactory } from "./kafkaOwnedPartitionGroup.js";
import {
	createKafkaOwnedPartitionProducer,
	type KafkaOwnedPartitionProducerLimits,
	type KafkaProducerFactoryPort,
} from "./kafkaOwnedPartitionProducer.js";

export type KafkaOwnedPartitionRuntimeFactory = (
	params: Parameters<KafkaPartitionRuntimeFactory>[0],
) => ReturnType<typeof createOwnedPartitionRuntime>;

export const createKafkaOwnedPartitionRuntimeFactory =
	({
		kafka,
		deploymentEnvironment,
		stateStore,
		partitionResolver,
		writerLimits,
		producerLimits,
		recoveryDrainTimeoutMs,
	}: {
		kafka: KafkaProducerFactoryPort;
		deploymentEnvironment: string;
		stateStore: SqliteBalanceStateStore;
		partitionResolver: MeteringPartitionResolver;
		writerLimits: PartitionTrackWriterLimits;
		producerLimits: KafkaOwnedPartitionProducerLimits;
		recoveryDrainTimeoutMs: number;
	}): KafkaOwnedPartitionRuntimeFactory =>
	({ topic, partition, follower }) =>
		createOwnedPartitionRuntime({
			topic,
			partition,
			stateStore,
			producer: createKafkaOwnedPartitionProducer({
				kafka,
				deploymentEnvironment,
				topic,
				partition,
				limits: producerLimits,
			}),
			follower,
			partitionResolver,
			writerLimits,
			recoveryDrainTimeoutMs,
		});
