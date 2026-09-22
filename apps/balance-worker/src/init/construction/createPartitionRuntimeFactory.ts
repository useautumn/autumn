import { createProducerSession } from "@autumn/kafka";
import { createMutationPublisher } from "../../kafka/createMutationPublisher.js";
import { createOwnershipPublisher } from "../../kafka/createOwnershipPublisher.js";
import { createWorkerProducer } from "../../kafka/createWorkerProducer.js";
import { createPartitionCommitLogging } from "../../logging/createPartitionCommitLogging.js";
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
	function createRuntime({
		topic,
		partition,
		follower,
		recentCommands,
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
		const appender = createMutationPublisher({ ctx: { producer } });
		const commitLogging = createPartitionCommitLogging({
			ctx: { appender, stateStore: ctx.stateStore, logger: ctx.logger },
			config: {
				deployment: config.deploymentEnvironment,
				endpoint: config.ownership.endpoint,
			},
		});
		const runtime = createPartitionRuntime({
			ctx: {
				stateStore: commitLogging.stateStore,
				db: ctx.db,
				catalogCache: ctx.catalogCache,
				checkpointMaintenance: ctx.checkpointMaintenance,
				bootstrapper: ctx.bootstrapper,
				follower,
				producer,
				appender: commitLogging.appender,
				partitionResolver: ctx.partitionResolver,
				receiptPolicy: {
					retentionMs: config.trackReceiptRetentionMs,
					now: Date.now,
				},
				recentCommands,
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
