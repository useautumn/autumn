import { describe, expect, test } from "bun:test";
import {
	createProducerSession,
	type KafkaProducerFactory,
	type KafkaProducerLimits,
	type KafkaProducerSession,
	type KafkaTransaction,
	type KafkaProducerClient as OwnedPartitionProducerPort,
} from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import {
	createOutcome,
	createState,
	partition,
	topic,
} from "./kafka-test-fixtures.js";

function createKafkaOwnedPartitionProducer({
	kafka,
	...config
}: {
	kafka: KafkaProducerFactory;
	deploymentEnvironment: string;
	topic: string;
	partition: number;
	limits: KafkaProducerLimits;
}) {
	return createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig(config),
	});
}
function ownedPartitionTransactionalIdOf(params: {
	deploymentEnvironment: string;
	topic: string;
	partition: number;
}): string {
	return createWorkerProducerConfig({
		...params,
		limits: {
			transactionTimeoutMs: 15_000,
			retryCount: 3,
			initialRetryTimeMs: 100,
			maxRetryTimeMs: 2_000,
		},
	}).transactionalId;
}

const fakeProducer = {} as OwnedPartitionProducerPort;

describe("Kafka owned partition producer", () => {
	test("uses a stable transactional identity and bounded producer settings", () => {
		let receivedConfig: ProducerConfig | undefined;
		const producer = createKafkaOwnedPartitionProducer({
			kafka: {
				producer: (config) => {
					receivedConfig = config;
					return fakeProducer;
				},
			},
			deploymentEnvironment: "staging/eu-west-1",
			topic: "metering-events-v1",
			partition: 3,
			limits: {
				transactionTimeoutMs: 15_000,
				retryCount: 3,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 2_000,
			},
		});

		expect(producer.isUsable()).toBe(false);
		expect(receivedConfig).toEqual({
			transactionalId:
				"autumn-balance-worker:staging%2Feu-west-1:metering-events-v1:3",
			idempotent: true,
			maxInFlightRequests: 1,
			transactionTimeout: 15_000,
			retry: {
				retries: 3,
				initialRetryTime: 100,
				maxRetryTime: 2_000,
			},
		});
	});

	test("changes the transactional identity only when ownership coordinates change", () => {
		const first = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 3,
		});
		const same = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 3,
		});
		const replacementPartition = ownedPartitionTransactionalIdOf({
			deploymentEnvironment: "staging",
			topic: "metering-events-v1",
			partition: 4,
		});

		expect(same).toBe(first);
		expect(replacementPartition).not.toBe(first);
	});

	test("rejects unbounded or invalid producer limits", () => {
		expect(() =>
			createKafkaOwnedPartitionProducer({
				kafka: { producer: () => fakeProducer },
				deploymentEnvironment: "staging",
				topic: "metering-events-v1",
				partition: 0,
				limits: {
					transactionTimeoutMs: 15_000,
					retryCount: Number.MAX_SAFE_INTEGER - 1,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 2_000,
				},
			}),
		).toThrow("retryCount");
	});
});

function createFailingSession({
	cause,
}: {
	cause: unknown;
}): KafkaProducerSession {
	async function connect(): Promise<void> {
		throw cause;
	}
	async function fence(): Promise<void> {
		throw cause;
	}
	async function transaction(): Promise<KafkaTransaction> {
		throw cause;
	}
	async function disconnect(): Promise<void> {}
	function isUsable(): boolean {
		return true;
	}
	return { connect, fence, transaction, disconnect, isUsable };
}

function createFencingError(): Error {
	return Object.assign(new Error("fenced by successor"), { code: 47 });
}

describe("Runtime producer error adapter", function runtimeProducerTests() {
	for (const method of ["connect", "fence", "transaction"] as const) {
		test(`${method} maps fencing to the metering partition`, async function mapsFencing() {
			const cause = createFencingError();
			const session = createFailingSession({ cause });
			const producer = createWorkerProducer({
				ctx: { session },
				config: { topic, partition },
			});
			await expect(producer[method]()).rejects.toMatchObject({
				name: "OwnedPartitionProducerFencedError",
				message: `Owned partition producer ${topic}[${partition}] was fenced`,
				cause,
			});
		});

		test(`${method} preserves non-fencing failures`, async function preservesFailure() {
			const cause = new Error("connection lost");
			const producer = createWorkerProducer({
				ctx: { session: createFailingSession({ cause }) },
				config: { topic, partition },
			});
			await expect(producer[method]()).rejects.toBe(cause);
		});
	}

	test("runtime disposal skips a second drain and retains package usability", async function retainsPackageMethods() {
		const session = createFailingSession({ cause: new Error("unused") });
		let disconnectOptions: unknown;
		async function disconnect(options?: {
			waitForTransactions?: boolean;
		}): Promise<void> {
			disconnectOptions = options;
		}
		session.disconnect = disconnect;
		const producer = createWorkerProducer({
			ctx: { session },
			config: { topic, partition },
		});
		await producer.disconnect();
		expect(disconnectOptions).toEqual({ waitForTransactions: false });
		expect(producer.isUsable).toBe(session.isUsable);
	});

	test("track fencing takes priority over known-abort classification", async function trackAcquisitionFailure() {
		const cause = createFencingError();
		const producer = createFailingSession({ cause });
		const appender = createTrackOutcomePublisher({ ctx: { producer } });
		await expect(
			appender.appendCommitted({
				topic,
				partition,
				outcomes: [
					createOutcome({ state: createState(), commandId: "fenced" }),
				],
			}),
		).rejects.toMatchObject({
			name: "OwnedPartitionProducerFencedError",
			cause: { name: "KafkaBatchNotCommittedError", cause },
		});
	});
});
