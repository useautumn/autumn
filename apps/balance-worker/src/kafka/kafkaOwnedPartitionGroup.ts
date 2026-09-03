import type {
	Admin,
	ConsumerCrashEvent,
	ConsumerGroupJoinEvent,
	ConsumerRebalancingEvent,
} from "kafkajs";
import type { SqliteBalanceStateStore } from "../state/sqliteBalanceStateStore.js";
import {
	createKafkaPartitionOutcomeFollower,
	type KafkaPartitionControlPort,
	type KafkaPartitionOutcomeFollower,
} from "./kafkaPartitionOutcomeFollower.js";
import { KafkaPartitionPositionTracker } from "./kafkaPartitionPositionTracker.js";
import {
	createKafkaTrackOutcomeConsumer,
	type KafkaPartitionOffsetsPort,
	type KafkaTrackOutcomeConsumerPort,
} from "./kafkaTrackOutcomeConsumer.js";

export type KafkaOwnedPartitionGroupConsumerPort =
	KafkaTrackOutcomeConsumerPort & KafkaPartitionControlPort;

export type KafkaOwnedPartitionGroupAdminPort = KafkaPartitionOffsetsPort &
	Pick<Admin, "connect" | "disconnect">;

export type KafkaPartitionRuntimePort = {
	start(): Promise<void>;
	stop(): Promise<void>;
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
};

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
	createRuntime,
	onError,
}: {
	consumer: KafkaOwnedPartitionGroupConsumerPort;
	partitionOffsets: KafkaOwnedPartitionGroupAdminPort;
	topic: string;
	stateStore: SqliteBalanceStateStore;
	partitionsConsumedConcurrently: number;
	createRuntime: KafkaPartitionRuntimeFactory;
	onError: ({ cause }: { cause: unknown }) => void;
}): {
	start(): Promise<void>;
	stop(): Promise<void>;
} => {
	if (topic.trim().length === 0) throw new Error("Kafka topic cannot be empty");
	if (
		!Number.isSafeInteger(partitionsConsumedConcurrently) ||
		partitionsConsumedConcurrently < 2
	) {
		throw new RangeError(
			"partitionsConsumedConcurrently must be a safe integer greater than one",
		);
	}

	const positionTracker = new KafkaPartitionPositionTracker();
	const outcomeConsumer = createKafkaTrackOutcomeConsumer({
		consumer,
		partitionOffsets,
		topic,
		stateStore,
		positionTracker,
		partitionsConsumedConcurrently,
	});
	const entries = new Map<number, OwnedPartitionEntry>();
	let status: "created" | "running" | "stopping" | "stopped" = "created";
	let generation = 0;
	let lifecycle = Promise.resolve();
	let stopPromise: Promise<void> | null = null;
	let adminConnected = false;
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

	const startAssignment = async ({
		assignmentGeneration,
		partitions,
	}: {
		assignmentGeneration: number;
		partitions: number[];
	}): Promise<void> => {
		if (status !== "running" || generation !== assignmentGeneration) return;

		const assignedEntries: OwnedPartitionEntry[] = [];
		for (const partition of partitions) {
			try {
				const follower = createKafkaPartitionOutcomeFollower({
					consumer,
					partitionOffsets,
					stateStore,
					positionTracker,
				});
				const runtime = createRuntime({ topic, partition, follower });
				const entry = { partition, follower, runtime };
				assignedEntries.push(entry);
				entries.set(partition, entry);
			} catch (cause) {
				reportError({ cause });
			}
		}

		const startResults = await Promise.allSettled(
			assignedEntries.map(({ runtime }) => runtime.start()),
		);
		for (const result of startResults) {
			if (result.status === "rejected") reportError({ cause: result.reason });
		}
	};

	const handleGroupJoin = (event: ConsumerGroupJoinEvent): void => {
		if (status !== "running") return;
		let partitions: number[];
		try {
			partitions = assignedPartitionsFrom({ event, topic });
		} catch (cause) {
			reportError({ cause });
			return;
		}

		if (partitions.length > 0) {
			try {
				consumer.pause([{ topic, partitions }]);
			} catch (cause) {
				reportError({ cause });
			}
		}
		generation += 1;
		const assignmentGeneration = generation;
		const entriesToStop = detachEntries({
			causeFor: ({ partition }) =>
				new KafkaPartitionAssignmentRevokedError({ topic, partition }),
		});
		const revocation = waitForRevocation({ entriesToStop });
		lifecycle = revocation
			.then(() => startAssignment({ assignmentGeneration, partitions }))
			.catch((cause) => reportError({ cause }));
	};

	const handleRebalancing = (_event: ConsumerRebalancingEvent): void => {
		if (status !== "running") return;
		generation += 1;
		const entriesToStop = detachEntries({
			causeFor: ({ partition }) =>
				new KafkaPartitionAssignmentRevokedError({ topic, partition }),
		});
		lifecycle = waitForRevocation({ entriesToStop });
	};

	const handleCrash = (event: ConsumerCrashEvent): void => {
		if (status !== "running") return;
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
			await outcomeConsumer.start();
		} catch (cause) {
			status = "stopped";
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
		generation += 1;
		for (const removeListener of removeEventListeners.splice(0)) {
			removeListener();
		}
		const entriesToStop = detachEntries();
		const previousLifecycle = lifecycle;
		const stoppingEntries = stopEntries(entriesToStop);
		stopPromise = (async () => {
			await Promise.allSettled([previousLifecycle, stoppingEntries]);
			const cleanupErrors: unknown[] = [];
			try {
				await outcomeConsumer.stop();
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

	return { start, stop };
};
