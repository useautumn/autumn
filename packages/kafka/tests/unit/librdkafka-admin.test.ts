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

/** librdkafka's own ListOffsets answer: an errored partition carries its error, which the KafkaJS shim drops. */
function createNativeAdminFake({
	answers,
}: {
	answers: { partition: number; offset: number; error?: Error }[][];
}) {
	const calls: { partition: number; timestamp: number }[][] = [];
	let disconnected = 0;
	const native = {
		listOffsets(
			partitions: { partition: number; offset: { timestamp: number } }[],
			_options: unknown,
			done: (error: unknown, offsets?: never) => void,
		) {
			calls.push(
				partitions.map(({ partition, offset }) => ({
					partition,
					timestamp: offset.timestamp,
				})),
			);
			done(null, (answers.shift() ?? []) as never);
		},
		disconnect() {
			disconnected += 1;
		},
	};
	const shimAdmin = {
		connect: async () => {},
		disconnect: async () => {},
		fetchTopicMetadata: async ({ topics }: { topics: string[] }) =>
			topics.map((name) => ({
				name,
				partitions: [
					{ partitionId: 0, leader: 1, replicas: [1], isr: [1] },
					{ partitionId: 1, leader: 2, replicas: [2], isr: [2] },
				],
			})),
		fetchTopicOffsets: async () => [
			{ partition: 0, offset: "40", high: "40", low: "0" },
			{ partition: 1, offset: "70", high: "70", low: "0" },
		],
	};
	const admin = createLibrdkafkaAdmin({
		ctx: {
			kafka: { admin: () => shimAdmin } as unknown as KafkaJS.Kafka,
			nativeClientConfig: {},
			createNative: () => {
				throw new Error("unused");
			},
			createNativeAdmin: () => native,
			log: createKafkaLog({ clientId: "test" }),
		},
	});
	return { admin, calls, disconnects: () => disconnected };
}

// The shim answered a moving leader's partition with the log end: a takeover then forgot its dedupe window.
test("offsets by timestamp report a partition whose leader is moving instead of answering the log end", async () => {
	const notLeader = Object.assign(
		new Error("Broker: Not leader for partition"),
		{
			code: 6,
		},
	);
	const fake = createNativeAdminFake({
		answers: [
			[
				{ partition: 0, offset: 12 },
				{ partition: 1, offset: -1, error: notLeader },
			],
			[
				{ partition: 0, offset: 12 },
				{ partition: 1, offset: 55 },
			],
		],
	});
	await expect(
		fake.admin.fetchTopicOffsetsByTimestamp("events", 1_000),
	).rejects.toBeInstanceOf(KafkaPartitionOffsetsUnansweredError);
	expect(
		await fake.admin.fetchTopicOffsetsByTimestamp("events", 1_000),
	).toEqual([
		{ partition: 0, offset: "12" },
		{ partition: 1, offset: "55" },
	]);
	expect(fake.calls[0]).toEqual([
		{ partition: 0, timestamp: 1_000 },
		{ partition: 1, timestamp: 1_000 },
	]);
	await fake.admin.disconnect();
	expect(fake.disconnects()).toBe(1);
});

test("a partition with nothing that recent answers its log end, as the shim did", async () => {
	const fake = createNativeAdminFake({
		answers: [
			[
				{ partition: 0, offset: -1 },
				{ partition: 1, offset: 55 },
			],
		],
	});
	expect(
		await fake.admin.fetchTopicOffsetsByTimestamp("events", 1_000),
	).toEqual([
		{ partition: 0, offset: "40" },
		{ partition: 1, offset: "55" },
	]);
});
