import type {
	Admin,
	ConsumerCrashEvent,
	ConsumerGroupJoinEvent,
	ConsumerRebalancingEvent,
} from "kafkajs";
import {
	type OwnedPartitionHealth,
	ownedPartitionFailureReasonOf,
	ownedPartitionHealthOf,
} from "../health/ownedPartitionHealth.js";
import { isPartitionBootstrapBlockedCause } from "../runtime/bootstrap/partitionBootstrapFailure.js";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import {
	createKafkaMeteringConsumer,
	type KafkaMeteringConsumerPort,
	KafkaPartitionOffsetsNotFoundError,
	type KafkaPartitionOffsetsPort,
} from "./kafkaMeteringConsumer.js";
import {
	createKafkaPartitionOutcomeFollower,
	type KafkaPartitionControlPort,
	type KafkaPartitionOutcomeFollower,
} from "./kafkaPartitionOutcomeFollower.js";
import { KafkaPartitionPositionTracker } from "./kafkaPartitionPositionTracker.js";
import { parseKafkaRecordOffset } from "./processKafkaMeteringRecord.js";

export type KafkaOwnedPartitionGroupConsumerPort = KafkaMeteringConsumerPort &
	KafkaPartitionControlPort;

export type KafkaOwnedPartitionGroupAdminPort = KafkaPartitionOffsetsPort &
	Pick<Admin, "connect" | "disconnect">;

export type KafkaPartitionRuntimePort = {
	start(): Promise<void>;
	stop(): Promise<void>;
	getHealth(): OwnedPartitionHealth;
};

export type KafkaPartitionRuntimeFactory = ({
	topic,
	partition,
	follower,
}: {
	topic: string;
	partition: number;
	follower: KafkaPartitionOutcomeFollower;
}) => KafkaPartitionRuntimePort;

export class KafkaPartitionAssignmentRevokedError extends Error {
	readonly topic: string;
	readonly partition: number;

	constructor({ topic, partition }: { topic: string; partition: number }) {
		super(`Kafka assignment revoked for ${topic}[${partition}]`);
		this.name = "KafkaPartitionAssignmentRevokedError";
		this.topic = topic;
		this.partition = partition;
	}
}

type OwnedPartitionEntry = {
	partition: number;
	follower: KafkaPartitionOutcomeFollower;
	runtime: KafkaPartitionRuntimePort;
	startupSettled: boolean;
};

const defaultPartitionBootstrapRetryIntervalMs = 30_000;

const assignedPartitionsFrom = ({
	event,
	topic,
}: {
	event: ConsumerGroupJoinEvent;
	topic: string;
}): number[] => {
	const partitions = event.payload.memberAssignment[topic] ?? [];
	for (const partition of partitions) {
		if (!Number.isSafeInteger(partition) || partition < 0) {
			throw new RangeError(`Invalid assigned Kafka partition: ${partition}`);
		}
	}
	return [...new Set(partitions)].sort((left, right) => left - right);
};

export const createKafkaOwnedPartitionGroup = ({
	consumer,
	partitionOffsets,
	topic,
	stateStore,
	partitionsConsumedConcurrently,
	healthRefreshIntervalMs,
	partitionBootstrapRetryIntervalMs = defaultPartitionBootstrapRetryIntervalMs,
	createRuntime,
	onError,
	onUnhealthyPartition,
}: {
	consumer: KafkaOwnedPartitionGroupConsumerPort;
	partitionOffsets: KafkaOwnedPartitionGroupAdminPort;
	topic: string;
	stateStore: SqliteBalanceStateStore;
	partitionsConsumedConcurrently: number;
	healthRefreshIntervalMs: number;
	partitionBootstrapRetryIntervalMs?: number;
	createRuntime: KafkaPartitionRuntimeFactory;
	onError: ({ cause }: { cause: unknown }) => void;
	onUnhealthyPartition: ({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: unknown;
	}) => void;
}): {
	start(): Promise<void>;
	stop(): Promise<void>;
	partitions(): OwnedPartitionHealth[];
} => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (
		!Number.isSafeInteger(partitionsConsumedConcurrently) ||
		partitionsConsumedConcurrently < 1
	) {
		throw new RangeError(
			"partitionsConsumedConcurrently must be a positive safe integer",
		);
	}
	if (
		!Number.isSafeInteger(healthRefreshIntervalMs) ||
		healthRefreshIntervalMs <= 0
	) {
		throw new RangeError(
			"healthRefreshIntervalMs must be a positive safe integer",
		);
	}
	if (
		!Number.isSafeInteger(partitionBootstrapRetryIntervalMs) ||
		partitionBootstrapRetryIntervalMs <= 0
	) {
		throw new RangeError(
			"partitionBootstrapRetryIntervalMs must be a positive safe integer",
		);
	}

	const positionTracker = new KafkaPartitionPositionTracker();
	const meteringConsumer = createKafkaMeteringConsumer({
		consumer,
		partitionOffsets,
		topic,
		stateStore,
		positionTracker,
		partitionsConsumedConcurrently,
	});
	const entries = new Map<number, OwnedPartitionEntry>();
	const retiringEntries = new Map<number, OwnedPartitionEntry>();
	const terminalHealthByPartition = new Map<number, OwnedPartitionHealth>();
	let status: "created" | "running" | "stopping" | "stopped" = "created";
	let generation = 0;
	let lifecycle = Promise.resolve();
	let stopPromise: Promise<void> | null = null;
	let adminConnected = false;
	let healthRefreshTimer: ReturnType<typeof setInterval> | null = null;
	let healthRefreshPromise: Promise<void> | null = null;
	const partitionRetryTimers = new Map<number, ReturnType<typeof setTimeout>>();
	const removeEventListeners: Array<() => void> = [];

	const reportError = ({ cause }: { cause: unknown }): void => {
		try {
			onError({ cause });
		} catch {
			return;
		}
	};

	const stopEntries = async (
		entriesToStop: OwnedPartitionEntry[],
	): Promise<void> => {
		const results = await Promise.allSettled(
			entriesToStop.map(({ runtime }) => runtime.stop()),
		);
		for (const result of results) {
			if (result.status === "rejected") reportError({ cause: result.reason });
		}
	};

	const clearPartitionRetry = ({ partition }: { partition: number }): void => {
		const timer = partitionRetryTimers.get(partition);
		if (!timer) return;
		clearTimeout(timer);
		partitionRetryTimers.delete(partition);
	};

	const clearPartitionRetries = (): void => {
		for (const timer of partitionRetryTimers.values()) clearTimeout(timer);
		partitionRetryTimers.clear();
	};

	const requestGroupStop = ({
		assignmentGeneration,
	}: {
		assignmentGeneration: number;
	}): void => {
		queueMicrotask(() => {
			if (status !== "running" || generation !== assignmentGeneration) return;
			void stop().catch((stopCause) => reportError({ cause: stopCause }));
		});
	};

	const schedulePartitionRetry = ({
		partition,
		entry,
		assignmentGeneration,
	}: {
		partition: number;
		entry?: OwnedPartitionEntry;
		assignmentGeneration: number;
	}): void => {
		if (partitionRetryTimers.has(partition)) return;
		const cleanup = entry
			? entry.runtime.stop().then(
					() => ({ ok: true }) as const,
					(cause: unknown) => ({ ok: false, cause }) as const,
				)
			: Promise.resolve({ ok: true } as const);
		const timer = setTimeout(() => {
			partitionRetryTimers.delete(partition);
			void (async () => {
				const cleanupResult = await cleanup;
				if (!cleanupResult.ok) {
					reportError({ cause: cleanupResult.cause });
					requestGroupStop({ assignmentGeneration });
					return;
				}
				if (
					status !== "running" ||
					generation !== assignmentGeneration ||
					(entry !== undefined && entries.get(partition) !== entry)
				) {
					return;
				}
				entries.delete(partition);
				await startAssignment({
					assignmentGeneration,
					partitions: [partition],
				});
			})().catch((cause) => {
				reportError({ cause });
				requestGroupStop({ assignmentGeneration });
			});
		}, partitionBootstrapRetryIntervalMs);
		timer.unref?.();
		partitionRetryTimers.set(partition, timer);
	};

	const reportUnhealthy = ({
		partition,
		cause,
		health,
		assignmentGeneration,
		entry,
	}: {
		partition: number;
		cause: unknown;
		health: OwnedPartitionHealth;
		assignmentGeneration: number;
		entry?: OwnedPartitionEntry;
	}): "group_stopping" | "ignored" | "partition_parked" => {
		if (
			status !== "running" ||
			generation !== assignmentGeneration ||
			(entry !== undefined && entries.get(partition) !== entry) ||
			terminalHealthByPartition.has(partition)
		) {
			return "ignored";
		}
		terminalHealthByPartition.set(partition, health);
		try {
			onUnhealthyPartition({ topic, partition, cause });
		} catch (callbackCause) {
			reportError({ cause: callbackCause });
		}
		if (isPartitionBootstrapBlockedCause({ cause })) {
			schedulePartitionRetry({ partition, entry, assignmentGeneration });
			return "partition_parked";
		}
		requestGroupStop({ assignmentGeneration });
		return "group_stopping";
	};

	const inspectUnhealthyEntries = ({
		assignmentGeneration,
	}: {
		assignmentGeneration: number;
	}): boolean => {
		let groupStopping = false;
		for (const entry of entries.values()) {
			const health = entry.runtime.getHealth();
			if (health.status !== "recovery_required") continue;
			if (!entry.startupSettled) continue;
			const disposition = reportUnhealthy({
				partition: entry.partition,
				entry,
				health,
				cause: new Error(
					health.failureReason ??
						`Owned partition ${topic}[${entry.partition}] is unhealthy`,
				),
				assignmentGeneration,
			});
			if (disposition === "group_stopping") groupStopping = true;
		}
		return groupStopping;
	};

	const refreshPartitionHealth = async (): Promise<void> => {
		if (status !== "running" || entries.size === 0) return;
		const refreshGeneration = generation;
		if (inspectUnhealthyEntries({ assignmentGeneration: refreshGeneration })) {
			return;
		}
		const offsets = await partitionOffsets.fetchTopicOffsets(topic);
		if (status !== "running" || generation !== refreshGeneration) return;
		for (const entry of entries.values()) {
			const partitionOffsets = offsets.find(
				(candidate) => candidate.partition === entry.partition,
			);
			if (!partitionOffsets) {
				throw new KafkaPartitionOffsetsNotFoundError({
					topic,
					partition: entry.partition,
				});
			}
			positionTracker.observeHighWatermark({
				topic,
				partition: entry.partition,
				highWatermark: parseKafkaRecordOffset({
					offset: partitionOffsets.high,
				}),
			});
		}
		inspectUnhealthyEntries({ assignmentGeneration: refreshGeneration });
	};

	const scheduleHealthRefresh = (): void => {
		healthRefreshTimer = setInterval(() => {
			if (healthRefreshPromise) return;
			healthRefreshPromise = refreshPartitionHealth()
				.catch((cause) => reportError({ cause }))
				.finally(() => {
					healthRefreshPromise = null;
				});
		}, healthRefreshIntervalMs);
		healthRefreshTimer.unref?.();
	};

	const stopHealthRefresh = (): void => {
		if (!healthRefreshTimer) return;
		clearInterval(healthRefreshTimer);
		healthRefreshTimer = null;
	};

	const detachEntries = ({
		causeFor,
	}: {
		causeFor?: (entry: OwnedPartitionEntry) => unknown;
	} = {}): OwnedPartitionEntry[] => {
		const detached = [...entries.values()];
		entries.clear();
		if (causeFor) {
			for (const entry of detached) {
				entry.follower.markUnavailable({ cause: causeFor(entry) });
			}
		}
		for (const entry of detached) {
			retiringEntries.set(entry.partition, entry);
		}
		return detached;
	};

	const waitForRevocation = ({
		entriesToStop,
	}: {
		entriesToStop: OwnedPartitionEntry[];
	}): Promise<void> => {
		const previousLifecycle = lifecycle;
		const stoppingEntries = stopEntries(entriesToStop);
		return Promise.allSettled([previousLifecycle, stoppingEntries]).then(
			(results) => {
				for (const result of results) {
					if (result.status === "rejected") {
						reportError({ cause: result.reason });
					}
				}
			},
		);
	};

	async function startAssignment({
		assignmentGeneration,
		partitions,
	}: {
		assignmentGeneration: number;
		partitions: number[];
	}): Promise<void> {
		if (status !== "running" || generation !== assignmentGeneration) return;

		const assignedEntries: OwnedPartitionEntry[] = [];
		for (const partition of partitions) {
			try {
				clearPartitionRetry({ partition });
				terminalHealthByPartition.delete(partition);
				retiringEntries.delete(partition);
				const follower = createKafkaPartitionOutcomeFollower({
					consumer,
					partitionOffsets,
					stateStore,
					positionTracker,
				});
				const runtime = createRuntime({ topic, partition, follower });
				const entry = {
					partition,
					follower,
					runtime,
					startupSettled: false,
				};
				assignedEntries.push(entry);
				entries.set(partition, entry);
			} catch (cause) {
				reportError({ cause });
				const progress = positionTracker.readProgress({ topic, partition });
				reportUnhealthy({
					partition,
					cause,
					health: ownedPartitionHealthOf({
						topic,
						partition,
						status: "recovery_required",
						localNextOffset: stateStore.readNextOffset({ topic, partition }),
						...progress,
						failureReason: ownedPartitionFailureReasonOf({ cause }),
					}),
					assignmentGeneration,
				});
			}
		}

		const startResults = await Promise.allSettled(
			assignedEntries.map(async (entry) => {
				try {
					await entry.runtime.start();
				} finally {
					entry.startupSettled = true;
				}
			}),
		);
		for (const [index, result] of startResults.entries()) {
			if (result.status !== "rejected") continue;
			reportError({ cause: result.reason });
			const entry = assignedEntries[index];
			if (!entry) continue;
			reportUnhealthy({
				partition: entry.partition,
				entry,
				cause: result.reason,
				health: entry.runtime.getHealth(),
				assignmentGeneration,
			});
		}
	}

	const handleGroupJoin = (event: ConsumerGroupJoinEvent): void => {
		if (status !== "running") return;
		let partitions: number[];
		try {
			partitions = assignedPartitionsFrom({ event, topic });
		} catch (cause) {
			reportError({ cause });
			return;
		}
		for (const terminalPartition of terminalHealthByPartition.keys()) {
			if (!partitions.includes(terminalPartition)) {
				terminalHealthByPartition.delete(terminalPartition);
			}
		}

		if (partitions.length > 0) {
			try {
				consumer.pause([{ topic, partitions }]);
			} catch (cause) {
				reportError({ cause });
			}
		}
		clearPartitionRetries();
		generation += 1;
		const assignmentGeneration = generation;
		const entriesToStop = detachEntries({
			causeFor: ({ partition }) =>
				new KafkaPartitionAssignmentRevokedError({ topic, partition }),
		});
		const revocation = waitForRevocation({ entriesToStop });
		lifecycle = revocation
			.then(() => {
				if (status === "running" && generation === assignmentGeneration) {
					retiringEntries.clear();
				}
				return startAssignment({ assignmentGeneration, partitions });
			})
			.catch((cause) => reportError({ cause }));
	};

	const handleRebalancing = (_event: ConsumerRebalancingEvent): void => {
		if (status !== "running") return;
		clearPartitionRetries();
		generation += 1;
		const entriesToStop = detachEntries({
			causeFor: ({ partition }) =>
				new KafkaPartitionAssignmentRevokedError({ topic, partition }),
		});
		lifecycle = waitForRevocation({ entriesToStop });
	};

	const handleCrash = (event: ConsumerCrashEvent): void => {
		if (status !== "running") return;
		clearPartitionRetries();
		generation += 1;
		const entriesToStop = detachEntries({
			causeFor: () => event.payload.error,
		});
		reportError({ cause: event.payload.error });
		lifecycle = waitForRevocation({ entriesToStop });
	};

	const start = async (): Promise<void> => {
		if (status !== "created") {
			throw new Error(
				`Kafka owned partition group cannot start while ${status}`,
			);
		}
		status = "running";
		removeEventListeners.push(
			consumer.on(consumer.events.GROUP_JOIN, handleGroupJoin),
			consumer.on(consumer.events.REBALANCING, handleRebalancing),
			consumer.on(consumer.events.CRASH, handleCrash),
		);
		try {
			await partitionOffsets.connect();
			adminConnected = true;
			await meteringConsumer.start();
			scheduleHealthRefresh();
		} catch (cause) {
			status = "stopped";
			stopHealthRefresh();
			for (const removeListener of removeEventListeners.splice(0)) {
				removeListener();
			}
			if (adminConnected) {
				adminConnected = false;
				await partitionOffsets.disconnect().catch(() => undefined);
			}
			throw cause;
		}
	};

	const stop = (): Promise<void> => {
		if (stopPromise) return stopPromise;
		if (status === "stopped") return Promise.resolve();
		if (status === "created") {
			status = "stopped";
			return Promise.resolve();
		}

		status = "stopping";
		stopHealthRefresh();
		clearPartitionRetries();
		generation += 1;
		for (const removeListener of removeEventListeners.splice(0)) {
			removeListener();
		}
		const entriesToStop = detachEntries();
		const previousLifecycle = lifecycle;
		const pendingHealthRefresh = healthRefreshPromise;
		const stoppingEntries = stopEntries(entriesToStop);
		stopPromise = (async () => {
			await Promise.allSettled([
				previousLifecycle,
				stoppingEntries,
				pendingHealthRefresh,
			]);
			const cleanupErrors: unknown[] = [];
			try {
				await meteringConsumer.stop();
			} catch (cause) {
				cleanupErrors.push(cause);
			}
			if (adminConnected) {
				adminConnected = false;
				try {
					await partitionOffsets.disconnect();
				} catch (cause) {
					cleanupErrors.push(cause);
				}
			}
			status = "stopped";
			if (cleanupErrors.length === 1) throw cleanupErrors[0];
			if (cleanupErrors.length > 1) {
				throw new AggregateError(
					cleanupErrors,
					"Failed to stop Kafka owned partition group",
				);
			}
		})();
		return stopPromise;
	};

	const partitions = (): OwnedPartitionHealth[] => {
		const healthByPartition = new Map<number, OwnedPartitionHealth>();
		for (const entry of retiringEntries.values()) {
			healthByPartition.set(entry.partition, entry.runtime.getHealth());
		}
		for (const [partition, health] of terminalHealthByPartition) {
			healthByPartition.set(partition, health);
		}
		for (const entry of entries.values()) {
			healthByPartition.set(entry.partition, entry.runtime.getHealth());
		}
		return [...healthByPartition.values()].sort(
			(left, right) => left.partition - right.partition,
		);
	};

	return { start, stop, partitions };
};
