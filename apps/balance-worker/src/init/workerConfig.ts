import {
	assertConsumerGroupTimings,
	createConsumerGroupConfig,
	type KafkaProducerLimits,
	type KafkaProducerSessionConfig,
	partitionProducerTransactionalIdOf,
} from "@autumn/kafka";
import type { Admin, ConsumerConfig, ITopicMetadata } from "kafkajs";
import type {
	KafkaBalanceWorkerTimings,
	PartitionRuntimeFactoryConfig,
} from "./types/partitionRuntimeFactory.js";

export function assertKafkaBalanceWorkerTimings({
	timings,
}: {
	timings: KafkaBalanceWorkerTimings;
}): void {
	assertConsumerGroupTimings({ timings });
	for (const name of [
		"healthRefreshIntervalMs",
		"recoveryDrainTimeoutMs",
	] as const) {
		if (!Number.isSafeInteger(timings[name]) || timings[name] <= 0) {
			throw new RangeError(`${name} must be a positive safe integer`);
		}
	}
	if (
		timings.rebalanceTimeoutMs - timings.recoveryDrainTimeoutMs <
		timings.heartbeatIntervalMs
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must leave at least one heartbeatIntervalMs before rebalanceTimeoutMs",
		);
	}
}

export function createWorkerConsumerConfig({
	groupId,
	timings,
}: {
	groupId: string;
	timings: KafkaBalanceWorkerTimings;
}): ConsumerConfig {
	assertKafkaBalanceWorkerTimings({ timings });
	return createConsumerGroupConfig({ groupId, timings });
}

export function createWorkerProducerConfig({
	deploymentEnvironment,
	topic,
	partition,
	limits,
}: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaProducerLimits;
}): KafkaProducerSessionConfig {
	return {
		transactionalId: partitionProducerTransactionalIdOf({
			prefix: "autumn-balance-worker",
			deploymentEnvironment,
			topic,
			partition,
		}),
		limits,
	};
}

export function balanceWorkerEnvToRuntimeConfig({
	env,
	endpoint,
}: {
	env: BalanceWorkerEnv;
	endpoint: string;
}): PartitionRuntimeFactoryConfig {
	return {
		deploymentEnvironment: env.BALANCE_WORKER_DEPLOYMENT,
		ownership: {
			topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
			endpoint,
		},
		checkpointRestoreLimits: {
			maxSerializedBytes: 64 * 1024 * 1024,
			maxStates: 100000,
			maxReceipts: 1000000,
		},
		checkpointRetryPolicy: {
			maxAttempts: 3,
			initialBackoffMs: 100,
			maxBackoffMs: 1000,
		},
		writerLimits: {
			maxBatchSize: 100,
			maxPendingCommands: 1000,
			maxPendingCommandsPerCustomer: 100,
		},
		trackReceiptRetentionMs: env.BALANCE_WORKER_RECEIPT_RETENTION_MS,
		producerLimits: {
			transactionTimeoutMs: 10000,
			retryCount: 2,
			initialRetryTimeMs: 100,
			maxRetryTimeMs: 1000,
		},
		timings: {
			fetchMaxWaitTimeMs: 250,
			healthRefreshIntervalMs: 1000,
			heartbeatIntervalMs: 3000,
			recoveryDrainTimeoutMs: 5000,
			rebalanceTimeoutMs: 60000,
			sessionTimeoutMs: 30000,
		},
	};
}

export async function validateBalanceWorkerTopics({
	admin,
	env,
}: {
	admin: Pick<Admin, "fetchTopicMetadata" | "describeConfigs">;
	env: BalanceWorkerEnv;
}): Promise<void> {
	const topics = [
		env.BALANCE_WORKER_METERING_TOPIC,
		env.BALANCE_WORKER_OWNERSHIP_TOPIC,
	];
	const metadata = await admin.fetchTopicMetadata({ topics });
	for (const topic of topics) {
		if (
			!hasMatchingTopicPartitions({
				topics: metadata.topics,
				topic,
				partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
			})
		) {
			throw new Error(
				`${topic} must exist with ${env.BALANCE_WORKER_PARTITION_COUNT} matching partitions; run the explicit local topic setup`,
			);
		}
	}
	const configs = await admin.describeConfigs({
		resources: [
			{
				type: 2,
				name: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
				configNames: ["cleanup.policy"],
			},
		],
		includeSynonyms: false,
	});
	let policy: string | null | undefined;
	for (const entry of configs.resources[0]?.configEntries ?? []) {
		if (entry.configName === "cleanup.policy") {
			policy = entry.configValue;
			break;
		}
	}
	if (policy !== "compact")
		throw new Error("Ownership topic must use compact-only cleanup.policy");
}

function hasMatchingTopicPartitions({
	topics,
	topic,
	partitionCount,
}: {
	topics: ITopicMetadata[];
	topic: string;
	partitionCount: number;
}): boolean {
	for (const entry of topics) {
		if (entry.name !== topic) continue;
		if (!entry.partitions || entry.partitions.length !== partitionCount)
			return false;
		for (const partition of entry.partitions) {
			if (partition.partitionId < 0 || partition.partitionId >= partitionCount)
				return false;
		}
		return true;
	}
	return false;
}

import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
