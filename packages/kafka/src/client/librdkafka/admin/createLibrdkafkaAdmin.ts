import type { KafkaJS } from "@autumn/librdkafka";
import { KafkaPartitionOffsetsUnansweredError } from "../../kafkaErrors.js";
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
const LEADER_WAIT_MS = 30_000;
const LEADER_POLL_MS = 50;
/** How often a ListOffsets that left partitions unanswered is asked again before it is reported. */
const LIST_OFFSETS_ATTEMPTS = 6;

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
	const retryBackoffMs = Number(
		ctx.nativeClientConfig["retry.backoff.ms"] ?? 100,
	);
	const retryBackoffMaxMs = Number(
		ctx.nativeClientConfig["retry.backoff.max.ms"] ?? 1_000,
	);
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

	/** Resolves once every new topic has a leader per partition, as kafkajs's default `waitForLeaders` did. */
	async function createTopics(options: {
		topics: ITopicConfig[];
		timeout?: number;
	}): Promise<boolean> {
		const created = await admin.createTopics(options);
		const names: string[] = [];
		for (const { topic } of options.topics) names.push(topic);
		const deadline = Date.now() + (options.timeout ?? LEADER_WAIT_MS);
		while (!(await haveLeaders({ topics: names }))) {
			if (Date.now() > deadline)
				throw new Error(`Topics have no leaders yet: ${names.join(", ")}`);
			await Bun.sleep(LEADER_POLL_MS);
		}
		return created;
	}

	/** The controller accepts a topic before every broker's metadata knows it; until then a read refuses it. */
	async function haveLeaders({
		topics,
	}: {
		topics: string[];
	}): Promise<boolean> {
		let described: KafkaJS.ITopicMetadata[];
		try {
			described = await admin.fetchTopicMetadata({ topics });
		} catch {
			return false;
		}
		if (described.length < topics.length) return false;
		for (const topic of described) {
			if (topic.partitions.length === 0) return false;
			for (const { leader } of topic.partitions) if (leader < 0) return false;
		}
		return true;
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

	/**
	 * Confluent's admin drops each partition's ListOffsets error and reports its offset as -1, which is what a
	 * partition whose leader just moved answers. kafkajs refreshed the leaders and asked again; so does this.
	 */
	async function fetchTopicOffsets(topic: string) {
		let backoffMs = retryBackoffMs;
		for (let attempt = 1; ; attempt++) {
			const offsets = await admin.fetchTopicOffsets(topic, {
				isolationLevel: READ_COMMITTED,
			});
			const unanswered: number[] = [];
			const described: {
				partition: number;
				offset: string;
				high: string;
				low: string;
			}[] = [];
			for (const { partition, offset, high, low } of offsets) {
				if (Number(high) < 0 || Number(low) < 0) unanswered.push(partition);
				described.push({ partition, offset, high, low });
			}
			if (unanswered.length === 0) return described;
			if (attempt >= LIST_OFFSETS_ATTEMPTS)
				throw new KafkaPartitionOffsetsUnansweredError({
					topic,
					partitions: unanswered,
				});
			await Bun.sleep(backoffMs);
			backoffMs = Math.min(backoffMs * 2, retryBackoffMaxMs);
		}
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
