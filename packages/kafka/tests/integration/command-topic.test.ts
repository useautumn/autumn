import { describe, expect, test } from "bun:test";
import { parseTrackCommand, type TrackCommand } from "@autumn/balance-engine";
import { Kafka, logLevel } from "kafkajs";
import { createKafkaClient } from "../../src/client/createKafkaClient.js";
import { createPartitionReader } from "../../src/consumer/reader/createPartitionReader.js";
import { meteringIdentityToPartition } from "../../src/partitioning/meteringIdentityToPartition.js";
import { createIdempotentProducerConfig } from "../../src/producer/producerConfig.js";
import { parseCommandRecord } from "../../src/topics/command/commandTopic.js";
import { createCommandPublisher } from "../../src/topics/command/publisher/createCommandPublisher.js";

if (!process.env.KAFKA_BROKERS?.trim()) {
	throw new Error(
		"KAFKA_BROKERS is required; run bun run test:kafka to reuse the development broker",
	);
}
const brokers = process.env.KAFKA_BROKERS.split(",").map((broker) =>
	broker.trim(),
);
const partitionCount = 4;

const uniqueName = ({ prefix }: { prefix: string }): string =>
	`${prefix}-${crypto.randomUUID().replaceAll("-", "")}`;

const trackFor = ({ customerId }: { customerId: string }): TrackCommand =>
	parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			org: {
				config: {
					reverse_deduction_order: false,
					block_overdue_entitlements: false,
					include_past_due: true,
				},
			},
			commandId: `cmd_${customerId}`,
			requestId: "req_1",
			identity: {
				orgId: "org_command_test",
				env: "sandbox",
				customerId,
				entityId: null,
			},
			featureId: "messages",
			internalFeatureId: "feat_messages",
			value: 1,
			overageBehavior: "reject",
			properties: null,
			usageEvent: { name: "messages", idempotencyKey: null, id: null },
			occurredAt: 1_700_000_000_000,
		},
	});

describe("command topic", () => {
	test("one append lands each command on the partition its identity routes to, and it parses back", async () => {
		const kafka = new Kafka(
			createKafkaClient({
				clientId: uniqueName({ prefix: "command-test" }),
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
		const topic = uniqueName({ prefix: "commands" });
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [{ topic, numPartitions: partitionCount, replicationFactor: 1 }],
		});
		const producer = kafka.producer(
			createIdempotentProducerConfig({
				limits: {
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 1_000,
				},
			}),
		);
		await producer.connect();
		const reader = createPartitionReader({
			ctx: { kafka },
			config: { topic, groupIdPrefix: "command-test-reader" },
		});
		try {
			const commands = ["alpha", "bravo", "charlie", "delta"].map(
				(customerId) => trackFor({ customerId }),
			);
			const records = commands.map((command) => ({
				partition: meteringIdentityToPartition({
					identity: command.identity,
					partitionCount,
				}),
				command,
			}));
			await createCommandPublisher({ ctx: { producer, topic } }).append({
				records,
			});

			const highWatermarkByPartition = new Map<number, bigint>();
			for (const offsets of await admin.fetchTopicOffsets(topic)) {
				highWatermarkByPartition.set(offsets.partition, BigInt(offsets.high));
			}
			for (const { partition, command } of records) {
				const read = await reader.readRange({
					partition,
					fromOffset: 0n,
					toOffset: highWatermarkByPartition.get(partition) ?? 0n,
					timeoutMs: 15_000,
				});
				const parsed = read.map((entry) =>
					parseCommandRecord({ key: entry.key, value: entry.value }),
				);
				expect(parsed).toContainEqual(command);
				for (const other of commands) {
					const expectedPartition = meteringIdentityToPartition({
						identity: other.identity,
						partitionCount,
					});
					if (expectedPartition !== partition)
						expect(parsed).not.toContainEqual(other);
				}
			}
		} finally {
			await Promise.allSettled([
				reader.disconnect(),
				producer.disconnect(),
				admin.deleteTopics({ topics: [topic] }),
			]);
			await admin.disconnect();
		}
	}, 60_000);
});
