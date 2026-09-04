import {
	createOwnedPartitionRuntime,
	type MeteringPartitionResolver,
} from "../runtime/ownedPartitionRuntime.js";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import type { PartitionTrackWriterLimits } from "../writer/partitionTrackWriter.js";
import {
	assertKafkaBalanceWorkerTimings,
	type KafkaBalanceWorkerTimings,
} from "./kafkaBalanceWorkerConfig.js";
import type { KafkaPartitionRuntimeFactory } from "./kafkaOwnedPartitionGroup.js";
import {
	createKafkaOwnedPartitionProducer,
	type KafkaOwnedPartitionProducerLimits,
	type KafkaProducerFactoryPort,
} from "./kafkaOwnedPartitionProducer.js";

export type KafkaOwnedPartitionRuntimeFactory = (
	params: Parameters<KafkaPartitionRuntimeFactory>[0],
) => ReturnType<typeof createOwnedPartitionRuntime>;

export const createKafkaOwnedPartitionRuntimeFactory = ({
	kafka,
	deploymentEnvironment,
	stateStore,
	partitionResolver,
	writerLimits,
	trackReceiptRetentionMs,
	producerLimits,
	timings,
}: {
	kafka: KafkaProducerFactoryPort;
	deploymentEnvironment: string;
	stateStore: SqliteBalanceStateStore;
	partitionResolver: MeteringPartitionResolver;
	writerLimits: PartitionTrackWriterLimits;
	trackReceiptRetentionMs: number;
	producerLimits: KafkaOwnedPartitionProducerLimits;
	timings: KafkaBalanceWorkerTimings;
}): KafkaOwnedPartitionRuntimeFactory => {
	assertKafkaBalanceWorkerTimings({ timings });
	if (
		!Number.isSafeInteger(trackReceiptRetentionMs) ||
		trackReceiptRetentionMs <= 0
	) {
		throw new RangeError(
			"trackReceiptRetentionMs must be a positive safe integer",
		);
	}
	return ({ topic, partition, follower }) =>
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
			trackReceiptPolicy: {
				retentionMs: trackReceiptRetentionMs,
				now: Date.now,
			},
			recoveryDrainTimeoutMs: timings.recoveryDrainTimeoutMs,
		});
};
