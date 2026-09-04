import type { PartitionCheckpointSource } from "../checkpoint/partitionCheckpointSource.js";
import {
	createPartitionBootstrapper,
	type PartitionBootstrapRetryPolicy,
} from "../runtime/bootstrap/partitionBootstrap.js";
import {
	createOwnedPartitionRuntime,
	type MeteringPartitionResolver,
} from "../runtime/ownedPartitionRuntime.js";
import type { PartitionCheckpointRestoreLimits } from "../state/checkpoint/restorePartitionCheckpoint.js";
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
	checkpointSource,
	partitionResolver,
	checkpointRestoreLimits,
	checkpointRetryPolicy,
	writerLimits,
	trackReceiptRetentionMs,
	producerLimits,
	timings,
}: {
	kafka: KafkaProducerFactoryPort;
	deploymentEnvironment: string;
	stateStore: SqliteBalanceStateStore;
	checkpointSource: PartitionCheckpointSource;
	partitionResolver: MeteringPartitionResolver;
	checkpointRestoreLimits: PartitionCheckpointRestoreLimits;
	checkpointRetryPolicy: PartitionBootstrapRetryPolicy;
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
	const bootstrapper = createPartitionBootstrapper({
		stateStore,
		checkpointSource,
		partitionResolver,
		restoreLimits: checkpointRestoreLimits,
		retryPolicy: checkpointRetryPolicy,
	});
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
			bootstrapper,
			partitionResolver,
			writerLimits,
			trackReceiptPolicy: {
				retentionMs: trackReceiptRetentionMs,
				now: Date.now,
			},
			recoveryDrainTimeoutMs: timings.recoveryDrainTimeoutMs,
		});
};
