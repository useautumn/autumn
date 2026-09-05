import { describe, expect, test } from "bun:test";
import {
	createProducerSession,
	KafkaBatchNotCommittedError,
	type KafkaProducerClient,
	type KafkaProducerFactory,
	type KafkaProducerLimits,
	type KafkaProducerSession,
	type KafkaTransaction,
	type KafkaProducerClient as OwnedPartitionProducerPort,
} from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createOwnershipPublisher } from "../../../src/kafka/createOwnershipPublisher.js";
import { createTrackOutcomePublisher } from "../../../src/kafka/createTrackOutcomePublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { OwnedPartitionProducerFencedError } from "../../../src/runtime/runtimeErrors.js";
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

test("ownership acquisition preserves the fenced cause inside the batch error", async function ownershipAcquisitionFailure() {
	const cause = createFencingError();
	const session = createWorkerProducer({
		ctx: { session: createFailingSession({ cause }) },
		config: { topic, partition },
	});
	async function fetchTopicOffsets() {
		return [{ partition, offset: "0", high: "0", low: "0" }];
	}
	const publication = createOwnershipPublisher({
		ctx: { session, partitionOffsets: { fetchTopicOffsets } },
		config: { topic: "owners", partition, endpoint: "http://worker.test" },
	});
	try {
		await publication.claim();
		throw new Error("Expected ownership acquisition to fail");
	} catch (error) {
		expect(error).toBeInstanceOf(KafkaBatchNotCommittedError);
		const batchError = error as KafkaBatchNotCommittedError;
		expect(batchError.cause).toBeInstanceOf(OwnedPartitionProducerFencedError);
		expect(batchError.cause).toMatchObject({
			message: `Owned partition producer ${topic}[${partition}] was fenced`,
			cause,
		});
	}
});

describe("ownershipPublication", function ownershipPublicationTests() {
	function createWorkerProducerFixture({
		producer,
		topic,
		partition,
	}: {
		producer: KafkaProducerClient;
		topic: string;
		partition: number;
	}): KafkaProducerSession {
		function createProducer(): KafkaProducerClient {
			return producer;
		}

		const session = createProducerSession({
			ctx: { kafka: { producer: createProducer } },
			config: createWorkerProducerConfig({
				deploymentEnvironment: "test",
				topic,
				partition,
				limits: {
					transactionTimeoutMs: 15_000,
					retryCount: 3,
					initialRetryTimeMs: 100,
					maxRetryTimeMs: 2_000,
				},
			}),
		});
		return createWorkerProducer({
			ctx: { session },
			config: { topic, partition },
		});
	}

	const deferred = () => {
		let resolve = (): void => undefined;
		const promise = new Promise<void>((settle) => {
			resolve = settle;
		});
		return { promise, resolve };
	};

	const fixture = ({
		commitFailure,
		sendFailure,
		metadataPartitions = [2],
	}: {
		commitFailure?: Error;
		sendFailure?: Error;
		metadataPartitions?: number[];
	} = {}) => {
		const events: string[] = [];
		let offset = 10;
		const producer = {
			connect: async () => {
				events.push("connect");
			},
			disconnect: async () => {
				events.push("disconnect");
			},
			transaction: async (): Promise<KafkaTransaction> => {
				events.push("transaction");
				return {
					send: async ({ topic, messages }) => {
						events.push(`send:${topic}:${messages[0]?.partition}`);
						if (sendFailure) throw sendFailure;
						return [
							{
								topicName: topic,
								partition: 2,
								errorCode: 0,
								baseOffset: String(offset++),
							},
						];
					},
					commit: async () => {
						events.push("commit");
						if (commitFailure) throw commitFailure;
					},
					abort: async () => {
						events.push("abort");
					},
				};
			},
		};
		const session = createWorkerProducerFixture({
			producer,
			topic: "metering",
			partition: 2,
		});
		const publication = createOwnershipPublisher({
			ctx: {
				session,
				partitionOffsets: {
					fetchTopicOffsets: async () =>
						metadataPartitions.map((partition) => ({
							partition,
							offset: "0",
							high: "0",
							low: "0",
						})),
				},
			},
			config: { topic: "owners", partition: 2, endpoint: "http://worker.test" },
		});
		return { session, publication, events };
	};

	describe("Partition ownership producer session", () => {
		test("cleanup never initializes or reconnects an unused session", async () => {
			const f = fixture();
			await f.publication.release();
			expect(f.events).toEqual([]);
			await expect(f.publication.claim()).rejects.toThrow("initialized");
			expect(f.events).toEqual([]);
		});
		test("claims nonzero partition with decimal ownership offset and validates metadata", async () => {
			const f = fixture();
			await f.session.connect();
			await f.session.fence();
			expect(await f.publication.claim()).toEqual({ routeEpoch: "10" });
			expect(f.events).toContain("send:owners:2");
			await f.publication.release();
			await f.session.disconnect();
			expect(f.events.at(-1)).toBe("disconnect");
			const missing = fixture({ metadataPartitions: [0] });
			await missing.session.connect();
			await missing.session.fence();
			await expect(missing.publication.claim()).rejects.toThrow(
				"must contain metering partition 2",
			);
			expect(missing.events).not.toContain("send:owners:2");
		});
		test("serializes whole transactions rather than individual requests", async () => {
			const f = fixture();
			await f.session.connect();
			await f.session.fence();
			const append = await f.session.transaction();
			const claim = f.publication.claim();
			await Bun.sleep(1);
			expect(f.events.filter((event) => event === "transaction")).toHaveLength(
				2,
			);
			await append.commit();
			await claim;
			expect(f.events.filter((event) => event === "transaction")).toHaveLength(
				3,
			);
		});
		for (const failure of ["ambiguous", "fenced"]) {
			test(`${failure} claim permanently disables cleanup transactions`, async () => {
				const f = fixture(
					failure === "ambiguous"
						? { commitFailure: new Error("unknown") }
						: {
								sendFailure: Object.assign(new Error("fenced"), { code: 47 }),
							},
				);
				await f.session.connect();
				await f.session.fence();
				await expect(f.publication.claim()).rejects.toBeDefined();
				const before = f.events.length;
				await f.publication.release();
				expect(f.events).toHaveLength(before);
				expect(f.session.isUsable()).toBe(false);
				await expect(f.session.connect()).rejects.toThrow("reconnect");
			});
		}
		test("disconnect waits for an outstanding claim transaction", async () => {
			const f = fixture();
			await f.session.connect();
			await f.session.fence();
			const transaction = await f.session.transaction();
			const gate = deferred();
			const commit = gate.promise.then(() => transaction.commit());
			const disconnect = f.session.disconnect({ waitForTransactions: true });
			await Bun.sleep(1);
			expect(f.events).not.toContain("disconnect");
			gate.resolve();
			await commit;
			await disconnect;
			expect(f.events.at(-1)).toBe("disconnect");
		});
	});
});
