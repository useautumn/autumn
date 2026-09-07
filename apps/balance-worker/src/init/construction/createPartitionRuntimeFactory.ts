import { createProducerSession } from "@autumn/kafka";
import { createOwnershipPublisher } from "../../kafka/createOwnershipPublisher.js";
import { createTrackOutcomePublisher } from "../../kafka/createTrackOutcomePublisher.js";
import { createWorkerProducer } from "../../kafka/createWorkerProducer.js";
import { createPartitionBootstrapper } from "../../runtime/bootstrap/createPartitionBootstrapper.js";
import { createPartitionRuntime } from "../../runtime/createPartitionRuntime.js";
import type {
	ConstructedPartitionRuntime,
	KafkaOwnedPartitionRuntimeFactory,
	PartitionRuntimeFactoryConfig,
	PartitionRuntimeFactoryContext,
	PartitionRuntimeFactoryInput,
} from "../types/partitionRuntimeFactory.js";
import {
	assertKafkaBalanceWorkerTimings,
	createWorkerProducerConfig,
} from "../workerConfig.js";

export function createPartitionRuntimeFactory({
	ctx,
	config,
}: {
	ctx: PartitionRuntimeFactoryContext;
	config: PartitionRuntimeFactoryConfig;
}): KafkaOwnedPartitionRuntimeFactory {
	assertKafkaBalanceWorkerTimings({ timings: config.timings });
	if (!config.ownership.topic.trim() || !config.ownership.endpoint.trim()) {
		throw new Error("Ownership topic and advertised endpoint are required");
	}
	if (
		!Number.isSafeInteger(config.trackReceiptRetentionMs) ||
		config.trackReceiptRetentionMs <= 0
	) {
		throw new RangeError(
			"trackReceiptRetentionMs must be a positive safe integer",
		);
	}
	const bootstrapper = createPartitionBootstrapper({
		stateStore: ctx.stateStore,
		checkpointSource: ctx.checkpointSource,
		partitionResolver: ctx.partitionResolver,
		restoreLimits: config.checkpointRestoreLimits,
		retryPolicy: config.checkpointRetryPolicy,
	});
	function createRuntime({
		topic,
		partition,
		follower,
	}: PartitionRuntimeFactoryInput): ConstructedPartitionRuntime {
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
		const publication = createOwnershipPublisher({
			ctx: { session: producer, partitionOffsets: ctx.ownershipOffsets },
			config: { ...config.ownership, partition },
		});
		const appender = createTrackOutcomePublisher({
			ctx: { producer },
		});
		const runtime = createPartitionRuntime({
			ctx: {
				stateStore: ctx.stateStore,
				bootstrapper,
				follower,
				producer,
				appender,
				partitionResolver: ctx.partitionResolver,
				trackReceiptPolicy: {
					retentionMs: config.trackReceiptRetentionMs,
					now: Date.now,
				},
			},
			config: {
				topic,
				partition,
				writerLimits: config.writerLimits,
				recoveryDrainTimeoutMs: config.timings.recoveryDrainTimeoutMs,
			},
		});
		return { runtime, publication };
	}
	return createRuntime;
}
