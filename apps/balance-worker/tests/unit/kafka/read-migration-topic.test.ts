import { describe, expect, test } from "bun:test";
import type { Admin, Kafka } from "kafkajs";
import { readMigrationTopic } from "../../../src/kafka/migrationConsumer/readMigrationTopic.js";

const TOPIC = "deployment-migrations";

const kafkaWith = ({
	listTopics,
	partitions = 4,
}: {
	listTopics: () => Promise<string[]>;
	partitions?: number;
}): { kafka: Pick<Kafka, "admin">; disconnects: () => number } => {
	let disconnected = 0;
	const admin = {
		connect: async () => {},
		disconnect: async () => {
			disconnected += 1;
		},
		listTopics,
		fetchTopicMetadata: async () => ({
			topics: [
				{
					name: TOPIC,
					partitions: Array.from({ length: partitions }, (_, partitionId) => ({
						partitionId,
						leader: 0,
						replicas: [0],
						isr: [0],
						partitionErrorCode: 0,
						offlineReplicas: [],
					})),
				},
			],
		}),
	} as unknown as Admin;
	return { kafka: { admin: () => admin }, disconnects: () => disconnected };
};

describe("readMigrationTopic", () => {
	test("a missing topic leaves the lane off", async () => {
		const { kafka, disconnects } = kafkaWith({ listTopics: async () => [] });
		expect(
			await readMigrationTopic({ kafka, topic: TOPIC, partitionCount: 4 }),
		).toBeUndefined();
		expect(disconnects()).toBe(1);
	});

	test("a topic with the worker's partition count turns the lane on", async () => {
		const { kafka } = kafkaWith({ listTopics: async () => [TOPIC] });
		expect(
			await readMigrationTopic({ kafka, topic: TOPIC, partitionCount: 4 }),
		).toBe(TOPIC);
	});

	test("a topic with another partition count leaves the lane off", async () => {
		const { kafka } = kafkaWith({
			listTopics: async () => [TOPIC],
			partitions: 8,
		});
		expect(
			await readMigrationTopic({ kafka, topic: TOPIC, partitionCount: 4 }),
		).toBeUndefined();
	});

	test("a broker that keeps refusing the listing leaves the lane off instead of failing the worker", async () => {
		const { kafka, disconnects } = kafkaWith({
			listTopics: async () => {
				throw new Error("TOPIC_AUTHORIZATION_FAILED");
			},
		});
		expect(
			await readMigrationTopic({ kafka, topic: TOPIC, partitionCount: 4 }),
		).toBeUndefined();
		expect(disconnects()).toBe(5);
	}, 15_000);

	test("a listing that fails once is read again and turns the lane on", async () => {
		let calls = 0;
		const { kafka } = kafkaWith({
			listTopics: async () => {
				calls += 1;
				if (calls === 1) throw new Error("REQUEST_TIMED_OUT");
				return [TOPIC];
			},
		});
		expect(
			await readMigrationTopic({ kafka, topic: TOPIC, partitionCount: 4 }),
		).toBe(TOPIC);
		expect(calls).toBe(2);
	}, 15_000);
});
