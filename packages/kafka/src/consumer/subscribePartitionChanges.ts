import type {
	Consumer,
	ConsumerCrashEvent,
	ConsumerGroupJoinEvent,
} from "kafkajs";
import type { KafkaPartitionChangeListeners } from "./types/partitionChanges.js";

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

function assignedPartitionsFrom({
	event,
	topic,
}: {
	event: ConsumerGroupJoinEvent;
	topic: string;
}): number[] {
	const partitions = event.payload.memberAssignment[topic] ?? [];
	for (const partition of partitions) {
		if (!Number.isSafeInteger(partition) || partition < 0) {
			throw new RangeError(`Invalid assigned Kafka partition: ${partition}`);
		}
	}
	return [...new Set(partitions)].sort(comparePartitions);
}

function comparePartitions(left: number, right: number): number {
	return left - right;
}

export function subscribePartitionChanges({
	ctx,
	topic,
}: {
	ctx: {
		consumer: Pick<Consumer, "events" | "on">;
		listeners: KafkaPartitionChangeListeners;
	};
	topic: string;
}): () => void {
	const { consumer, listeners } = ctx;
	function causeForPartition({ partition }: { partition: number }): Error {
		return new KafkaPartitionAssignmentRevokedError({ topic, partition });
	}

	function notifyPartitionsAssigned(event: ConsumerGroupJoinEvent): void {
		let partitions: number[];
		try {
			partitions = assignedPartitionsFrom({ event, topic });
		} catch (cause) {
			listeners.onError({ cause });
			return;
		}
		listeners.onAssigned({ partitions, causeForPartition });
	}
	function notifyPartitionsRevoked(): void {
		listeners.onRevoked({ causeForPartition });
	}
	function notifyConsumerCrashed(event: ConsumerCrashEvent): void {
		listeners.onCrashed({ cause: event.payload.error });
	}
	const removeListeners = [
		consumer.on(consumer.events.GROUP_JOIN, notifyPartitionsAssigned),
		consumer.on(consumer.events.REBALANCING, notifyPartitionsRevoked),
		consumer.on(consumer.events.CRASH, notifyConsumerCrashed),
	];
	function unsubscribe(): void {
		for (const removeListener of removeListeners.splice(0)) removeListener();
	}

	return unsubscribe;
}
