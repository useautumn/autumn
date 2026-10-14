import {
	BALANCE_WORKER_SUBJECT_IDLE_EXPIRY_MS,
	BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION,
} from "@autumn/env/balanceWorkerConstants";
import {
	assertConsumerGroupTimings,
	coPartitionedAssigner,
	createConsumerGroupConfig,
	createLoadAwareAssigner,
	type KafkaCommitMode,
	type KafkaProducerLimits,
	type KafkaProducerSessionConfig,
	type PartitionLoadSource,
	partitionProducerTransactionalIdOf,
} from "@autumn/kafka";
import type { Admin, ConsumerConfig, ITopicMetadata } from "kafkajs";
import {
	createSubjectMapBudget,
	subjectMapBudgetBytesOf,
} from "../processor/writer/subjectMap/createSubjectMapBudget.js";
import { readContainerMemoryBytes } from "./containerMemory.js";
import type {
	KafkaBalanceWorkerTimings,
	PartitionRuntimeFactoryConfig,
} from "./types/partitionRuntimeFactory.js";
import { workerCheckpointLimits } from "./workerCheckpointConfig.js";

export const PRODUCER_RETRY_BUDGET_MS = 5_000;

/** kafkajs stretches each backoff by up to this fraction. */
const PRODUCER_RETRY_JITTER = 0.2;

export function assertRecoveryDrainOutlastsProducerRetries({
	producerLimits,
	timings,
}: {
	producerLimits: Pick<
		KafkaProducerLimits,
		"retryCount" | "initialRetryTimeMs" | "maxRetryTimeMs"
	>;
	timings: Pick<KafkaBalanceWorkerTimings, "recoveryDrainTimeoutMs">;
}): void {
	let backoffMs = 0;
	for (let attempt = 0; attempt < producerLimits.retryCount; attempt++)
		backoffMs += Math.min(
			producerLimits.initialRetryTimeMs * 2 ** attempt,
			producerLimits.maxRetryTimeMs,
		);
	const worstCaseMs = backoffMs * (1 + PRODUCER_RETRY_JITTER);
	if (timings.recoveryDrainTimeoutMs <= worstCaseMs) {
		throw new RangeError(
			`recoveryDrainTimeoutMs must exceed the producer's worst-case retries (${worstCaseMs} ms)`,
		);
	}
}

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
	if (timings.fetchMaxWaitTimeMs > timings.heartbeatIntervalMs) {
		throw new RangeError(
			"fetchMaxWaitTimeMs cannot exceed heartbeatIntervalMs: kafkajs heartbeats only between fetches",
		);
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

export function workerConsumerGroupIdOf({
	env,
	fleetId,
}: {
	env: Pick<BalanceWorkerEnv, "BALANCE_WORKER_GROUP_ID">;
	fleetId: string | null;
}): string {
	return fleetId
		? `${env.BALANCE_WORKER_GROUP_ID}-${fleetId}`
		: env.BALANCE_WORKER_GROUP_ID;
}

export function createWorkerConsumerConfig({
	groupId,
	timings,
	partitionLoad,
}: {
	groupId: string;
	timings: KafkaBalanceWorkerTimings;
	partitionLoad?: PartitionLoadSource;
}): ConsumerConfig {
	assertKafkaBalanceWorkerTimings({ timings });
	// Kafka only admits a member whose protocols overlap the group's, picks the one every member
	return {
		...createConsumerGroupConfig({ groupId, timings }),
		partitionAssigners: partitionLoad
			? [
					createLoadAwareAssigner({ loads: partitionLoad }),
					coPartitionedAssigner,
				]
			: [coPartitionedAssigner],
	};
}

export function createWorkerProducerConfig({
	deploymentEnvironment,
	topic,
	partition,
	limits,
	mode,
}: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaProducerLimits;
	mode?: KafkaCommitMode;
}): KafkaProducerSessionConfig {
	return {
		transactionalId: partitionProducerTransactionalIdOf({
			prefix: "autumn-balance-worker",
			deploymentEnvironment,
			topic,
			partition,
		}),
		limits,
		...(mode === undefined ? {} : { mode }),
	};
}

export function balanceWorkerEnvToRuntimeConfig({
	env,
	endpoint,
	groupId,
}: {
	env: BalanceWorkerEnv;
	endpoint: string;
	groupId: string;
}): PartitionRuntimeFactoryConfig {
	return {
		deploymentEnvironment: env.BALANCE_WORKER_DEPLOYMENT,
		commit: { mode: env.BALANCE_WORKER_COMMIT_MODE },
		commands: {
			commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC,
			groupId,
		},
		ownership: {
			topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
			endpoint,
		},
		checkpointRestoreLimits: workerCheckpointLimits,
		checkpointRetryPolicy: {
			maxAttempts: 3,
			initialBackoffMs: 100,
			maxBackoffMs: 1000,
		},
		writerLimits: {
			maxBatchSize: 500,
			maxPendingCommands: 4000,
			maxPendingCommandsPerCustomer: 1000,
			subjectMapBudget: createSubjectMapBudget({
				totalBytes: subjectMapBudgetBytesOf({
					containerMemoryBytes: readContainerMemoryBytes(),
					memoryFraction: BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION,
				}),
			}),
			subjectIdleExpiryMs: BALANCE_WORKER_SUBJECT_IDLE_EXPIRY_MS,
			commitLingerMs: 5,
			applyLingerMs: 500,
		},
		trackReceiptRetentionMs: env.BALANCE_WORKER_RECEIPT_RETENTION_MS,
		producerLimits: {
			transactionTimeoutMs: 30_000,
			retryCount: 10,
			initialRetryTimeMs: 10,
			maxRetryTimeMs: 2_500,
		},
		timings: {
			fetchMaxWaitTimeMs: env.BALANCE_WORKER_FETCH_MAX_WAIT_MS,
			healthRefreshIntervalMs: 1000,
			heartbeatIntervalMs: 3000,
			recoveryDrainTimeoutMs: 15000,
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
		env.BALANCE_WORKER_COMMAND_TOPIC,
	];
	const metadata = await admin.fetchTopicMetadata({
		topics: [...topics, env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC],
	});
	if (
		!hasMatchingTopicPartitions({
			topics: metadata.topics,
			topic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
			partitionCount: 1,
		})
	) {
		throw new Error(
			`${env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC} must exist with one partition; run the explicit local topic setup`,
		);
	}
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
