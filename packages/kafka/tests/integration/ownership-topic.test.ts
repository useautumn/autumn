import { describe, expect, test } from "bun:test";
import { Kafka, logLevel } from "kafkajs";
import { createKafkaClient } from "../../src/client/createKafkaClient.js";
import { createProducerSession } from "../../src/producer/createProducerSession.js";
import { partitionProducerTransactionalIdOf } from "../../src/producer/producerConfig.js";
import { createKafkaOwnershipLog } from "../../src/topics/ownership/consumer/createKafkaOwnershipLog.js";
import { createOwnershipConsumer } from "../../src/topics/ownership/consumer/createOwnershipConsumer.js";
import { createOwnershipPublisher } from "../../src/topics/ownership/publisher/createOwnershipPublisher.js";

if (!process.env.KAFKA_BROKERS?.trim()) {
	throw new Error(
		"KAFKA_BROKERS is required; run bun run test:kafka to reuse the development broker",
	);
}
const brokers = process.env.KAFKA_BROKERS.split(",").map((broker) =>
	broker.trim(),
);
const partition = 0;

const uniqueName = ({ prefix }: { prefix: string }): string =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

describe("ownership topic", () => {
	test("claim is visible, release clears, and the later claim wins", async () => {
		const kafka = new Kafka(
			createKafkaClient({
				clientId: uniqueName({ prefix: "ownership-test" }),
				brokers,
				transport: { logLevel: logLevel.NOTHING },
				limits: {
					connectionTimeoutMs: 3_000,
					requestTimeoutMs: 10_000,
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1_000,
				},
			}),
		);
		const admin = kafka.admin();
		const topic = uniqueName({ prefix: "partition-owners" });
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{
					topic,
					numPartitions: 1,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});

		const producer = createProducerSession({
			ctx: { kafka },
			config: {
				transactionalId: partitionProducerTransactionalIdOf({
					prefix: "autumn-balance-worker",
					deploymentEnvironment: "test",
					topic,
					partition,
				}),
				limits: {
					transactionTimeoutMs: 15_000,
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1_000,
				},
			},
		});
		await producer.connect();

		const ownershipPublisher = createOwnershipPublisher({
			ctx: { producer },
			config: { topic },
		});
		const log = createKafkaOwnershipLog({ ctx: { kafka }, config: { topic } });
		const consumer = createOwnershipConsumer({ ctx: { log } });

		try {
			const first = await ownershipPublisher.claim({
				partition,
				endpoint: "http://10.0.0.4:8080",
				claimedAt: Date.now(),
			});
			await consumer.start();
			expect(consumer.findOwner({ partition })).toEqual({
				partition,
				endpoint: "http://10.0.0.4:8080",
				routeEpoch: first.routeEpoch,
			});

			await ownershipPublisher.release({
				partition,
				releasedAt: Date.now(),
			});
			await consumer.refresh();
			expect(consumer.findOwner({ partition })).toBeUndefined();

			const second = await ownershipPublisher.claim({
				partition,
				endpoint: "http://10.0.0.8:8080",
				claimedAt: Date.now(),
			});
			await consumer.refresh();
			expect(consumer.findOwner({ partition })).toEqual({
				partition,
				endpoint: "http://10.0.0.8:8080",
				routeEpoch: second.routeEpoch,
			});
			expect(BigInt(second.routeEpoch)).toBeGreaterThan(
				BigInt(first.routeEpoch),
			);
		} finally {
			await consumer.stop();
			await log.disconnect?.();
			await producer.disconnect();
			await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
			await admin.disconnect();
		}
	});
});
