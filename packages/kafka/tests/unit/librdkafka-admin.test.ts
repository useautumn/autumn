import { expect, test } from "bun:test";
import type { KafkaJS } from "@autumn/librdkafka";
import { KafkaPartitionOffsetsUnansweredError } from "../../src/client/kafkaErrors.js";
import { createLibrdkafkaAdmin } from "../../src/client/librdkafka/admin/createLibrdkafkaAdmin.js";
import { createKafkaLog } from "../../src/client/librdkafka/kafkaLog.js";

/** A shim admin whose metadata shows the new topic only after a few reads, as a broker's does. */
function createLaggingShim({
	readsUntilVisible,
}: {
	readsUntilVisible: number;
}) {
	const calls: string[] = [];
	let metadataReads = 0;
	const admin = {
		createTopics: async () => {
			calls.push("create");
			return true;
		},
		fetchTopicMetadata: async ({ topics }: { topics: string[] }) => {
			metadataReads += 1;
			calls.push("metadata");
			if (metadataReads < readsUntilVisible)
				throw Object.assign(new Error("Broker: Unknown topic or partition"), {
					code: 3,
				});
			return topics.map((name) => ({
				name,
				partitions: [{ partitionId: 0, leader: 1, replicas: [1], isr: [1] }],
			}));
		},
	};
	const kafka = { admin: () => admin } as unknown as KafkaJS.Kafka;
	return { kafka, calls };
}

test("createTopics resolves only once every new topic has a leader, as kafkajs's waitForLeaders did", async () => {
	const shim = createLaggingShim({ readsUntilVisible: 3 });
	const admin = createLibrdkafkaAdmin({
		ctx: {
			kafka: shim.kafka,
			nativeClientConfig: {},
			createNative: () => {
				throw new Error("unused");
			},
			log: createKafkaLog({ clientId: "test" }),
		},
	});
	await admin.createTopics({
		topics: [{ topic: "owners", numPartitions: 1 }],
	});
	expect(shim.calls).toEqual(["create", "metadata", "metadata", "metadata"]);
});

/** A shim admin whose ListOffsets drops a moving leader's error and answers -1, as Confluent's does. */
function createMovingLeaderShim({
	unansweredReads,
}: {
	unansweredReads: number;
}) {
	let reads = 0;
	const admin = {
		fetchTopicOffsets: async () => {
			reads += 1;
			const moving = reads <= unansweredReads;
			return [
				{ partition: 0, offset: "7", high: "7", low: "0" },
				{
					partition: 1,
					offset: moving ? "-1" : "9",
					high: moving ? "-1" : "9",
					low: moving ? "-1" : "2",
				},
			];
		},
	};
	const kafka = { admin: () => admin } as unknown as KafkaJS.Kafka;
	return { kafka, reads: () => reads };
}

function adminOver(kafka: KafkaJS.Kafka) {
	return createLibrdkafkaAdmin({
		ctx: {
			kafka,
			nativeClientConfig: { "retry.backoff.ms": 1, "retry.backoff.max.ms": 2 },
			createNative: () => {
				throw new Error("unused");
			},
			log: createKafkaLog({ clientId: "test" }),
		},
	});
}

test("fetchTopicOffsets asks again while a partition's leader is moving instead of reporting -1", async () => {
	const shim = createMovingLeaderShim({ unansweredReads: 2 });
	const offsets = await adminOver(shim.kafka).fetchTopicOffsets("events");
	expect(offsets).toEqual([
		{ partition: 0, offset: "7", high: "7", low: "0" },
		{ partition: 1, offset: "9", high: "9", low: "2" },
	]);
	expect(shim.reads()).toBe(3);
});

test("fetchTopicOffsets reports a partition that never answers as retriable, never as offset -1", async () => {
	const shim = createMovingLeaderShim({ unansweredReads: 100 });
	const failure = await adminOver(shim.kafka)
		.fetchTopicOffsets("events")
		.catch((cause: unknown) => cause);
	expect(failure).toBeInstanceOf(KafkaPartitionOffsetsUnansweredError);
	expect((failure as KafkaPartitionOffsetsUnansweredError).partitions).toEqual([
		1,
	]);
	expect((failure as KafkaPartitionOffsetsUnansweredError).retriable).toBe(
		true,
	);
});
