import { expect, test } from "bun:test";
import {
	computeTrack,
	createCustomerMeteringState,
	parseTrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { Kafka, logLevel, type Producer } from "kafkajs";
import {
	createMeteringConsumer,
	createMeteringPublisher,
	createMeteringReader,
	createProgressTracker,
	type MeteringRecordApplication,
	readPartitionLogRange,
	serializeMeteringRecord,
} from "../../src/kafka.js";

const partition = 0;

function createTestKafka(): Kafka {
	if (!process.env.KAFKA_BROKERS?.trim()) {
		throw new Error(
			"Set KAFKA_BROKERS to an existing test broker before running bun run test:kafka",
		);
	}
	const brokers: string[] = [];
	for (const broker of process.env.KAFKA_BROKERS.split(",")) {
		brokers.push(broker.trim());
	}
	return new Kafka({
		clientId: `metering-consumer-test-${crypto.randomUUID()}`,
		brokers,
		logLevel: logLevel.NOTHING,
		connectionTimeout: 3_000,
		requestTimeout: 10_000,
		retry: { retries: 3, initialRetryTime: 100, maxRetryTime: 1_000 },
	});
}

function createOutcome({ commandId }: { commandId: string }): TrackOutcome {
	const identity = {
		orgId: "org_consumer_test",
		env: "sandbox" as const,
		customerId: "customer_consumer_test",
	};
	const state = createCustomerMeteringState({
		identity,
		featureStatesById: {
			messages: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{ id: "messages_monthly", balance: 10, usage: 0 },
				],
			},
		},
	});
	const decision = computeTrack({
		state,
		command: parseTrackCommand({
			input: {
				schemaVersion: 1,
				type: "track",
				commandId,
				requestId: `request-${commandId}`,
				identity,
				entityId: null,
				featureId: "messages",
				value: 1,
				overageBehavior: "reject",
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		}),
	});
	if (decision.kind !== "new") throw new Error("Expected a new outcome");
	return decision.outcome;
}

async function appendAbortedOutcome({
	producer,
	topic,
	record,
}: {
	producer: Producer;
	topic: string;
	record: TrackOutcome;
}): Promise<bigint> {
	const transaction = await producer.transaction();
	try {
		const metadata = await transaction.send({
			topic,
			acks: -1,
			messages: [{ ...serializeMeteringRecord({ record }), partition }],
		});
		const offset = metadata[0]?.baseOffset;
		if (offset === undefined) throw new Error("Missing appended offset");
		return BigInt(offset);
	} finally {
		await transaction.abort();
	}
}

async function appendCommittedOutcome({
	producer,
	topic,
	record,
}: {
	producer: Producer;
	topic: string;
	record: TrackOutcome;
}): Promise<{ baseOffset: bigint }> {
	const publisher = createMeteringPublisher({ ctx: { producer } });
	return publisher.append({ topic, partition, records: [record] });
}

async function consumesAndReadsMeteringWithoutWorkerState(): Promise<void> {
	const kafka = createTestKafka();
	const topic = `metering-consumer-${crypto.randomUUID()}`;
	const admin = kafka.admin();
	const producer = kafka.producer({
		transactionalId: `metering-consumer-test-${crypto.randomUUID()}`,
		idempotent: true,
		maxInFlightRequests: 1,
		transactionTimeout: 15_000,
	});
	const reader = createMeteringReader({ ctx: { kafka }, config: { topic } });
	const progress = createProgressTracker();
	const accepted: MeteringRecordApplication[] = [];
	const applying = Promise.withResolvers<MeteringRecordApplication>();
	const releaseApplication = Promise.withResolvers<void>();
	let applicationTimeout: ReturnType<typeof setTimeout> | undefined;
	let topicCreated = false;
	let cleanup: PromiseSettledResult<void>[] = [];

	function readResumeOffset(): null {
		return null;
	}
	async function applyRecord(
		application: MeteringRecordApplication,
	): Promise<undefined> {
		applying.resolve(application);
		await releaseApplication.promise;
		accepted.push(application);
		return undefined;
	}
	function failApplicationWait(): void {
		applying.reject(
			new Error("Timed out waiting for the first metering record"),
		);
	}
	const consumer = createMeteringConsumer({
		ctx: {
			consumer: kafka.consumer({
				groupId: `metering-sink-${crypto.randomUUID()}`,
				readUncommitted: false,
				allowAutoTopicCreation: false,
				maxWaitTimeInMs: 250,
			}),
			progress,
			handler: { readResumeOffset, applyRecord },
		},
		config: { topic },
	});

	await admin.connect();
	try {
		await admin.createTopics({
			waitForLeaders: true,
			topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
		});
		topicCreated = true;
		await producer.connect();
		await consumer.start();

		const first = createOutcome({ commandId: "committed-first" });
		const firstPosition = await appendCommittedOutcome({
			producer,
			topic,
			record: first,
		});
		applicationTimeout = setTimeout(failApplicationWait, 20_000);
		expect(await applying.promise).toEqual({
			position: { topic, partition, offset: firstPosition.baseOffset },
			record: first,
		});
		clearTimeout(applicationTimeout);
		expect(accepted).toEqual([]);
		expect(progress.read({ topic, partition }) ?? 0n).toBeLessThan(
			firstPosition.baseOffset + 1n,
		);

		releaseApplication.resolve();
		await progress.waitUntil({
			topic,
			partition,
			nextOffset: firstPosition.baseOffset + 1n,
			signal: AbortSignal.timeout(15_000),
		});
		expect(accepted).toHaveLength(1);

		await appendAbortedOutcome({
			producer,
			topic,
			record: createOutcome({ commandId: "aborted-middle" }),
		});
		const second = createOutcome({ commandId: "committed-second" });
		const secondPosition = await appendCommittedOutcome({
			producer,
			topic,
			record: second,
		});
		const abortedTail = await appendAbortedOutcome({
			producer,
			topic,
			record: createOutcome({ commandId: "aborted-tail" }),
		});
		const range = await readPartitionLogRange({
			ctx: { partitionOffsets: admin },
			topic,
			partition,
		});
		await progress.waitUntil({
			topic,
			partition,
			nextOffset: range.logEndOffset,
			signal: AbortSignal.timeout(15_000),
		});
		expect(accepted).toEqual([
			{
				position: { topic, partition, offset: firstPosition.baseOffset },
				record: first,
			},
			{
				position: { topic, partition, offset: secondPosition.baseOffset },
				record: second,
			},
		]);

		expect(
			await reader.readRange({
				partition,
				fromOffset: firstPosition.baseOffset,
				toOffset: secondPosition.baseOffset,
			}),
		).toEqual([{ partition, offset: firstPosition.baseOffset, record: first }]);
		expect(
			await reader.readRange({
				partition,
				fromOffset: secondPosition.baseOffset,
				toOffset: abortedTail,
			}),
		).toEqual([
			{ partition, offset: secondPosition.baseOffset, record: second },
		]);
		expect(
			await reader.readRange({
				partition,
				fromOffset: abortedTail,
				toOffset: range.logEndOffset,
			}),
		).toEqual([]);
	} finally {
		clearTimeout(applicationTimeout);
		releaseApplication.resolve();
		cleanup = await Promise.allSettled([
			consumer.stop(),
			reader.disconnect(),
			producer.disconnect(),
		]);
		try {
			if (topicCreated) await admin.deleteTopics({ topics: [topic] });
		} finally {
			await admin.disconnect();
		}
	}
	for (const result of cleanup) {
		if (result.status === "rejected") throw result.reason;
	}
}

test(
	"standalone metering consumption applies before progress and reads committed bounded ranges including an aborted tail",
	consumesAndReadsMeteringWithoutWorkerState,
	90_000,
);
