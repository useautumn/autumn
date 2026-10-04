import { describe, expect, test } from "bun:test";
import { Kafka, logLevel } from "kafkajs";
import { createKafkaClient } from "../../src/client/createKafkaClient.js";
import { createProducerSession } from "../../src/producer/createProducerSession.js";
import { sendIdempotentBatch } from "../../src/producer/sendIdempotentBatch.js";

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

function batchOf({ tag, count }: { tag: string; count: number }) {
	return Array.from({ length: count }, (_, index) => ({
		key: Buffer.from(`${tag}-${index}`),
		value: Buffer.from(`value-${tag}-${index}`),
	}));
}

describe("pipelined idempotent produce", () => {
	test("batches sent without waiting for each other land contiguously, in send order, under one producer", async () => {
		const kafka = new Kafka(
			createKafkaClient({
				clientId: uniqueName({ prefix: "pipelined-produce-test" }),
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
		const topic = uniqueName({ prefix: "pipelined-produce" });
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
		});
		const session = createProducerSession({
			ctx: { kafka },
			config: {
				// Unused in idempotent mode: the session has no transactions to fence with.
				transactionalId: uniqueName({ prefix: "pipelined-produce" }),
				mode: "idempotent",
				limits: {
					transactionTimeoutMs: 15_000,
					maxInFlightRequests: 2,
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1_000,
				},
			},
		});
		await session.connect();
		await session.fence();
		try {
			const sizes = [3, 1, 4, 2, 5];
			const appends = sizes.map((count, index) =>
				sendIdempotentBatch({
					sender: session,
					topic,
					partition,
					messages: batchOf({ tag: `b${index}`, count }),
					ownerEpoch: "1",
				}),
			);
			const landed = await Promise.all(appends);
			let expected = 0n;
			for (const [index, { baseOffset }] of landed.entries()) {
				expect(baseOffset).toBe(expected);
				expected += BigInt(sizes[index] ?? 0);
			}

			const reader = kafka.consumer({
				groupId: uniqueName({ prefix: "pipelined-produce-reader" }),
				maxWaitTimeInMs: 250,
			});
			await reader.connect();
			await reader.subscribe({ topic, fromBeginning: true });
			const keys: string[] = [];
			const done = Promise.withResolvers<void>();
			await reader.run({
				eachMessage: async ({ message }) => {
					keys.push(message.key?.toString("utf8") ?? "");
					if (keys.length === 15) done.resolve();
				},
			});
			await Promise.race([
				done.promise,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("records not read")), 10_000),
				),
			]);
			await reader.disconnect();
			expect(keys).toEqual(
				sizes.flatMap((count, index) =>
					Array.from({ length: count }, (_, i) => `b${index}-${i}`),
				),
			);
		} finally {
			await session.disconnect();
			await admin.deleteTopics({ topics: [topic] }).catch(() => undefined);
			await admin.disconnect();
		}
	});
});
