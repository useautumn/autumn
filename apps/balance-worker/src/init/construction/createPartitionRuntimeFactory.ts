import { createProducerSession } from "@autumn/kafka";
import { createTrackOutcomePublisher } from "../../kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../kafka/createWorkerProducer.js";
import { createPartitionRuntime } from "../../runtime/createPartitionRuntime.js";
import type {
	PartitionRuntimeFactory,
	PartitionRuntimeFactoryConfig,
	PartitionRuntimeFactoryContext,
	PartitionRuntimeFactoryInput,
} from "../types/partitionRuntimeFactory.js";
import { assertKafkaBalanceWorkerTimings } from "../workerConfig.js";

export function createPartitionRuntimeFactory({
	ctx,
	config,
}: {
	ctx: PartitionRuntimeFactoryContext;
	config: PartitionRuntimeFactoryConfig;
}): PartitionRuntimeFactory {
	assertKafkaBalanceWorkerTimings({ timings: config.timings });
	if (
		!Number.isSafeInteger(config.trackReceiptRetentionMs) ||
		config.trackReceiptRetentionMs <= 0
	) {
		throw new RangeError(
			"trackReceiptRetentionMs must be a positive safe integer",
		);
	}
	function createRuntime({
		topic,
		partition,
		follower,
	}: PartitionRuntimeFactoryInput) {
		const session = createProducerSession({
			ctx: { kafka: ctx.kafka },
			config: createWorkerProducerConfig({
				deploymentEnvironment: config.deploymentEnvironment,
				topic,
				partition,
				limits: config.producerLimits,
			}),
		});
		const producer = createWorkerProducer({
			ctx: { session },
			config: { topic, partition },
		});
		const appender = createTrackOutcomePublisher({ ctx: { producer } });
		return createPartitionRuntime({
			ctx: {
				trackReceiptPolicy: {
					retentionMs: config.trackReceiptRetentionMs,
					now: Date.now,
				},
				stateStore: ctx.stateStore,
				partitionResolver: ctx.partitionResolver,
				follower,
				producer,
				appender,
			},
			config: {
				topic,
				partition,
				writerLimits: config.writerLimits,
				recoveryDrainTimeoutMs: config.timings.recoveryDrainTimeoutMs,
			},
		});
	}
	return createRuntime;
}
