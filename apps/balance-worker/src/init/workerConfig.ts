import { BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION } from "@autumn/env/balanceWorkerConstants";
import {
	type Admin,
	assertConsumerGroupTimings,
	type ConsumerConfig,
	createConsumerGroupConfig,
	type ITopicMetadata,
	type KafkaCommitMode,
	type KafkaProducerLimits,
	type KafkaProducerSessionConfig,
	partitionProducerTransactionalIdOf,
} from "@autumn/kafka";
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

/** A leader election or a replica rejoining the ISR lasts seconds; an append waits it out rather than end unknown. */
export const PRODUCER_RETRY_BUDGET_MS = 5_000;

/** librdkafka jitters each backoff by up to this fraction (KIP-580). */
const PRODUCER_RETRY_JITTER = 0.2;

/** A drain that ends while an append still retries disposes the writer under it, and the append can land after a successor's fence. */
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
	if (
		timings.rebalanceTimeoutMs - timings.recoveryDrainTimeoutMs <
		timings.heartbeatIntervalMs
	) {
		throw new RangeError(
			"recoveryDrainTimeoutMs must leave at least one heartbeatIntervalMs before rebalanceTimeoutMs",
		);
	}
}

/**
 * Each ECS fleet consumes in its own group, so a green boot never rebalances blue's
 * partitions away; off ECS (local, tests) one group is the whole fleet. `kip848` keeps
 * the worker out of the classic groups kafkajs joined: the broker will not convert a
 * group whose members carried custom assignor metadata, so partitions move by handoff.
 */
export function workerConsumerGroupIdOf({
	env,
	fleetId,
}: {
	env: Pick<BalanceWorkerEnv, "BALANCE_WORKER_GROUP_ID">;
	fleetId: string | null;
}): string {
	const group = `${env.BALANCE_WORKER_GROUP_ID}-kip848`;
	return fleetId ? `${group}-${fleetId}` : group;
}

export function createWorkerConsumerConfig({
	groupId,
	timings,
}: {
	groupId: string;
	timings: KafkaBalanceWorkerTimings;
}): ConsumerConfig {
	assertKafkaBalanceWorkerTimings({ timings });
	// Range deals partition n of every subscribed topic to one member, as the co-partitioned assigner did.
	return createConsumerGroupConfig({
		groupId,
		timings,
		remoteAssignor: "range",
	});
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
}: {
	env: BalanceWorkerEnv;
	endpoint: string;
}): PartitionRuntimeFactoryConfig {
	return {
		deploymentEnvironment: env.BALANCE_WORKER_DEPLOYMENT,
		commit: { mode: env.BALANCE_WORKER_COMMIT_MODE },
		commands: { commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC },
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
			// One append is in flight per partition, so records/s ≤ batch ÷ commit latency; the 800 KB byte cap binds near here.
			maxBatchSize: 500,
			// Sized for one customer bursting 500 parallel tracks, the largest the balance suites send.
			maxPendingCommands: 4000,
			maxPendingCommandsPerCustomer: 1000,
			subjectMapBudget: createSubjectMapBudget({
				totalBytes: subjectMapBudgetBytesOf({
					containerMemoryBytes: readContainerMemoryBytes(),
					memoryFraction: BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION,
				}),
			}),
			// A busy partition carries several tracks per commit instead of one; a quiet one never waits.
			commitLingerMs: 5,
		},
		trackReceiptRetentionMs: env.BALANCE_WORKER_RECEIPT_RETENTION_MS,
		producerLimits: {
			// How long the coordinator lets a transaction stay open before it aborts
			// it and fences the producer. Callers fail open in a couple of seconds
			// regardless; this decides what a stalled thread costs afterwards. At
			// 10 s a partition thread pinned by a hot customer came back fenced and
			// took its task down; at 30 s the same stall commits late and nothing
			// dies. A live owner's open transaction only holds its followers back,
			// and a dead owner's is aborted the moment its successor initialises.
			transactionTimeoutMs: 30_000,
			// CONCURRENT_TRANSACTIONS clears in a few ms, so backoff starts at 10 ms; ten doublings
			// capped at 2.5 s wait ~7.5 s in all, past PRODUCER_RETRY_BUDGET_MS.
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
	admin: Pick<Admin, "fetchTopicMetadata">;
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
