import type { KafkaJS } from "@autumn/librdkafka";
import type {
	Admin,
	ITopicConfig,
	ITopicMetadata,
} from "../../types/kafkaWire.js";
import type { NativeConsumerFactory } from "../consumer/types/nativeConsumer.js";
import type { KafkaLog } from "../kafkaLog.js";
import { type NativeDone, settleNative } from "../settleNative.js";

/** KafkaJS.IsolationLevel.READ_COMMITTED, without loading the addon to read the enum. */
const READ_COMMITTED = 1 as KafkaJS.IsolationLevel;

type PartitionOffset = { partition: number; offset: string };

function topicMetadataOf(topic: KafkaJS.ITopicMetadata): ITopicMetadata {
	const partitions: ITopicMetadata["partitions"] = [];
	for (const { partitionId, leader, replicas, isr } of topic.partitions)
		partitions.push({ partitionId, leader, replicas, isr });
	return { name: topic.name, partitions };
}

function partitionOffsetsOf(
	entries: readonly PartitionOffset[],
): PartitionOffset[] {
	const offsets: PartitionOffset[] = [];
	for (const { partition, offset } of entries)
		offsets.push({ partition, offset });
	return offsets;
}

/** Confluent's KafkaJS admin in kafkajs's shapes, plus `setOffsets`, which it lacks. */
export function createLibrdkafkaAdmin({
	ctx,
}: {
	ctx: {
		kafka: KafkaJS.Kafka;
		nativeClientConfig: Record<string, unknown>;
		createNative: NativeConsumerFactory;
		log: KafkaLog;
	};
}): Admin {
	const admin = ctx.kafka.admin({
		...ctx.nativeClientConfig,
		kafkaJS: { logger: ctx.log.shim },
	} as KafkaJS.AdminConstructorConfig);

	function connect(): Promise<void> {
		return admin.connect();
	}

	function disconnect(): Promise<void> {
		return admin.disconnect();
	}

	function createTopics(options: {
		topics: ITopicConfig[];
		timeout?: number;
	}): Promise<boolean> {
		return admin.createTopics(options);
	}

	function deleteTopics(options: {
		topics: string[];
		timeout?: number;
	}): Promise<void> {
		return admin.deleteTopics(options);
	}

	/** Moves each partition's log start up to `offset`; tests use it to drop a replayable tail. */
	async function deleteTopicRecords(options: {
		topic: string;
		partitions: PartitionOffset[];
	}): Promise<void> {
		await admin.deleteTopicRecords({
			topic: options.topic,
			partitions: partitionOffsetsOf(options.partitions),
		});
	}

	function listTopics(): Promise<string[]> {
		return admin.listTopics();
	}

	async function fetchTopicMetadata(options?: { topics?: string[] }) {
		const topics = await admin.fetchTopicMetadata(options ?? {});
		const described: ITopicMetadata[] = [];
		for (const topic of topics) described.push(topicMetadataOf(topic));
		return { topics: described };
	}

	async function fetchTopicOffsets(topic: string) {
		const offsets = await admin.fetchTopicOffsets(topic, {
			isolationLevel: READ_COMMITTED,
		});
		const described: {
			partition: number;
			offset: string;
			high: string;
			low: string;
		}[] = [];
		for (const { partition, offset, high, low } of offsets)
			described.push({ partition, offset, high, low });
		return described;
	}

	async function fetchTopicOffsetsByTimestamp(
		topic: string,
		timestamp: number,
	) {
		const offsets = await admin.fetchTopicOffsetsByTimestamp(topic, timestamp, {
			isolationLevel: READ_COMMITTED,
		});
		return partitionOffsetsOf(offsets);
	}

	async function fetchOffsets({
		groupId,
		topics,
	}: {
		groupId: string;
		topics: string[];
	}) {
		const committed = await admin.fetchOffsets({ groupId, topics });
		const described: { topic: string; partitions: PartitionOffset[] }[] = [];
		for (const { topic, partitions } of committed)
			described.push({ topic, partitions: partitionOffsetsOf(partitions) });
		return described;
	}

	/** A group-only commit from a consumer that never joins; the broker takes it only while the group is empty. */
	async function setOffsets({
		groupId,
		topic,
		partitions,
	}: {
		groupId: string;
		topic: string;
		partitions: PartitionOffset[];
	}): Promise<void> {
		const native = ctx.createNative({
			global: {
				...ctx.nativeClientConfig,
				"group.id": groupId,
				"group.protocol": "classic",
				"enable.auto.commit": false,
			},
			topic: {},
		});
		const offsets: { topic: string; partition: number; offset: number }[] = [];
		for (const { partition, offset } of partitions)
			offsets.push({ topic, partition, offset: Number(offset) });
		function connectNative(done: NativeDone): void {
			native.connect({}, done);
		}
		function commitOffsets(done: NativeDone): void {
			native.commitCb(offsets, done);
		}
		function disconnectNative(done: NativeDone): void {
			native.disconnect(done);
		}
		await settleNative(connectNative);
		try {
			await settleNative(commitOffsets);
		} finally {
			await settleNative(disconnectNative);
		}
	}

	return {
		connect,
		disconnect,
		createTopics,
		deleteTopics,
		deleteTopicRecords,
		listTopics,
		fetchTopicMetadata,
		fetchTopicOffsets,
		fetchTopicOffsetsByTimestamp,
		fetchOffsets,
		setOffsets,
	};
}
