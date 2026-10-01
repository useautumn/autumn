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

/**
 * Each ECS fleet consumes in its own group, so a green boot never rebalances blue's
 * partitions away; off ECS (local, tests) the base group is the whole fleet.
 */
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
	/** When given, partitions are dealt by the load the workers report rather than by number. */
	partitionLoad?: PartitionLoadSource;
}): ConsumerConfig {
	assertKafkaBalanceWorkerTimings({ timings });
	// Both topics share the membership; either assigner keeps partition n of each on one worker.
	// The plain assigner stays advertised so a rollout can mix old and new workers in one group:
	// Kafka only admits a member whose protocols overlap the group's, picks the one every member
	// supports, and moves to the load-aware one on the first rebalance after the old workers leave.
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
	/** The group the worker consumes in; command offsets are committed under it. */
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
			maxBatchSize: 100,
			// Sized for one customer bursting 500 parallel tracks, the largest the balance suites send.
			maxPendingCommands: 4000,
			maxPendingCommandsPerCustomer: 1000,
			subjectMapBudget: createSubjectMapBudget({
				totalBytes: subjectMapBudgetBytesOf({
					containerMemoryBytes: readContainerMemoryBytes(),
					memoryFraction: env.BALANCE_WORKER_SUBJECT_MAP_MEMORY_FRACTION,
					overrideBytes: env.BALANCE_WORKER_SUBJECT_MAP_BUDGET_BYTES,
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
			// Back-to-back transactions routinely hit CONCURRENT_TRANSACTIONS while the
			// coordinator is still writing the previous commit's markers, which clears in
			// a few ms. Start the backoff there instead of at 100ms; eight doublings still
			// ride out a broker blip for over a second before giving up.
			retryCount: 8,
			initialRetryTimeMs: 5,
			maxRetryTimeMs: 1000,
		},
		timings: {
			fetchMaxWaitTimeMs: env.BALANCE_WORKER_FETCH_MAX_WAIT_MS,
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
