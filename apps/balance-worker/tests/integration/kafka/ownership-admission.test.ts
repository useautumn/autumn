import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCustomerMeteringState,
	parseTrackCommand,
} from "@autumn/balance-engine";
import {
	createKafkaOwnershipLog,
	createOwnershipConsumer,
	createProducerSession,
	type PartitionOwner,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import { createWorkerConsumerConfig } from "../../../src/init/workerConfig.js";
import { createOwnershipPublisher } from "../../../src/kafka/createOwnershipPublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { openSqliteBalanceStateStore } from "../../../src/state/sqliteBalanceStateStore.js";

if (!process.env.KAFKA_BROKERS?.trim())
	throw new Error("Run test:kafka with an environment broker");
const brokers = process.env.KAFKA_BROKERS.split(",").map((broker) =>
	broker.trim(),
);
const partition = 2;
const waitFor = async (condition: () => boolean) => {
	for (let attempt = 0; attempt < 1000; attempt++) {
		if (condition()) return;
		await Bun.sleep(10);
	}
	throw new Error("Ownership admission did not settle");
};
const timings = {
	fetchMaxWaitTimeMs: 250,
	healthRefreshIntervalMs: 5_000,
	heartbeatIntervalMs: 3_000,
	recoveryDrainTimeoutMs: 5_000,
	rebalanceTimeoutMs: 60_000,
	sessionTimeoutMs: 30_000,
};
const producerLimits = {
	transactionTimeoutMs: 10_000,
	retryCount: 2,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 1_000,
};

describe("Real ownership admission", () => {
	test("nonzero assignment claims, commits admitted track, and releases before disconnect", async () => {
		const id = crypto.randomUUID();
		const topic = `ownership-worker-${id}`;
		const owners = `${topic}-owners`;
		const kafka = new Kafka({
			clientId: id,
			brokers,
			logLevel: logLevel.NOTHING,
		});
		const admin = kafka.admin();
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{ topic, numPartitions: 3, replicationFactor: 1 },
				{
					topic: owners,
					numPartitions: 3,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
		const directory = mkdtempSync(join(tmpdir(), "ownership-admitted-"));
		const store = openSqliteBalanceStateStore({
			databasePath: join(directory, "state.sqlite"),
		});
		for (const partition of [0, 1, 2])
			store.initializePartition({ topic, partition, nextOffset: 0n });
		const state = createCustomerMeteringState({
			identity: { orgId: "org_1", env: "sandbox", customerId: "customer" },
			featureStatesById: {
				messages: {
					kind: "direct_metered_v1",
					customerEntitlements: [{ id: "balance", balance: 10, usage: 0 }],
				},
			},
		});
		store.restoreState({
			topic,
			partition,
			initializationId: "initial",
			state,
		});
		const lifecycle: string[] = [];
		const errors: unknown[] = [];
		const factory = createPartitionRuntimeFactory({
			ctx: {
				kafka,
				ownershipOffsets: admin,
				stateStore: store,
				checkpointSource: { latest: async () => null },
				partitionResolver: { partitionForIdentity: () => partition },
			},
			config: {
				deploymentEnvironment: id,
				ownership: { topic: owners, endpoint: "http://worker.test" },
				checkpointRestoreLimits: {
					maxSerializedBytes: 1_000_000,
					maxStates: 100,
					maxReceipts: 100,
				},
				checkpointRetryPolicy: {
					maxAttempts: 1,
					initialBackoffMs: 1,
					maxBackoffMs: 1,
				},
				writerLimits: {
					maxBatchSize: 100,
					maxPendingCommands: 100,
					maxPendingCommandsPerCustomer: 10,
				},
				trackReceiptRetentionMs: 86_400_000,
				producerLimits,
				timings,
			},
		});
		const worker = createWorkerPartitions({
			ctx: {
				consumer: kafka.consumer(
					createWorkerConsumerConfig({ groupId: id, timings }),
				),
				partitionOffsets: kafka.admin(),
				stateStore: store,
				createRuntime: (params) => {
					const resources = factory(params);
					return {
						runtime: {
							...resources.runtime,
							stop: async () => {
								await resources.runtime.stop();
								lifecycle.push(`disconnected:${params.partition}`);
							},
						},
						publication: {
							claim: resources.publication.claim,
							release: async () => {
								await resources.publication.release();
								if (params.partition === partition)
									expect(
										store.readState({ identity: state.identity })?.revision,
									).toBe(1);
								lifecycle.push(`released:${params.partition}`);
							},
						},
					};
				},
				onError: ({ cause }) => errors.push(cause),
				onUnhealthyPartition: () => undefined,
			},
			config: {
				topic,
				partitionsConsumedConcurrently: 3,
				healthRefreshIntervalMs: 5_000,
			},
		});
		const log = createKafkaOwnershipLog({
			ctx: { kafka },
			config: { topic: owners },
		});
		const routing = createOwnershipConsumer({ ctx: { log } });
		let owner: PartitionOwner | undefined;
		try {
			await worker.start();
			await waitFor(
				() =>
					worker.partitions().filter(({ status }) => status === "ready")
						.length === 3,
			);
			await routing.start();
			for (let attempt = 0; attempt < 5 && !owner; attempt++) {
				await routing.refresh();
				owner = routing.findOwner({ partition });
			}
			if (!owner) throw new Error(`No ownership claim: ${errors.map(String)}`);
			const admitted = worker.findRuntime(owner);
			if (!admitted) throw new Error("Claim was not admitted");
			expect(
				worker.findRuntime({ ...owner, routeEpoch: "999999" }),
			).toBeUndefined();
			const command = parseTrackCommand({
				input: {
					schemaVersion: 1,
					type: "track",
					commandId: id,
					requestId: id,
					identity: state.identity,
					entityId: null,
					featureId: "messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					occurredAt: Date.now(),
				},
			});
			const submitted = admitted.submitTrack({ command });
			const stopping = worker.stop();
			expect(worker.findRuntime(owner)).toBeUndefined();
			await submitted;
			expect(store.readState({ identity: state.identity })?.revision).toBe(1);
			await stopping;
			await routing.refresh();
			expect(routing.findOwner({ partition })).toBeUndefined();
			expect(lifecycle.indexOf("released:2")).toBeLessThan(
				lifecycle.indexOf("disconnected:2"),
			);
			expect(errors).toEqual([]);
		} finally {
			await worker.stop();
			await routing.stop();
			await log.disconnect?.();
			store.close();
			rmSync(directory, { recursive: true, force: true });
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
		}
	});

	test("successor fences the old admitted owner so stale withdrawal cannot erase its claim", async () => {
		const id = crypto.randomUUID();
		const topic = `ownership-fence-${id}`;
		const owners = `${topic}-owners`;
		const kafka = new Kafka({
			clientId: id,
			brokers,
			logLevel: logLevel.NOTHING,
		});
		const admin = kafka.admin();
		await admin.connect();
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{ topic, numPartitions: 3, replicationFactor: 1 },
				{
					topic: owners,
					numPartitions: 3,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
		const makeSession = () =>
			createWorkerProducer({
				ctx: {
					session: createProducerSession({
						ctx: { kafka },
						config: createWorkerProducerConfig({
							deploymentEnvironment: id,
							topic,
							partition,
							limits: producerLimits,
						}),
					}),
				},
				config: { topic, partition },
			});
		const first = makeSession();
		const second = makeSession();
		const publication = (session: typeof first, endpoint: string) =>
			createOwnershipPublisher({
				ctx: { session, partitionOffsets: admin },
				config: { topic: owners, partition, endpoint },
			});
		const old = publication(first, "http://old.test");
		const successor = publication(second, "http://new.test");
		const log = createKafkaOwnershipLog({
			ctx: { kafka },
			config: { topic: owners },
		});
		const routing = createOwnershipConsumer({ ctx: { log } });
		try {
			await first.connect();
			await first.fence();
			const prior = await old.claim();
			await second.connect();
			await second.fence();
			const next = await successor.claim();
			expect(BigInt(next.routeEpoch)).toBeGreaterThan(BigInt(prior.routeEpoch));
			await expect(old.release()).rejects.toBeDefined();
			expect(first.isUsable()).toBe(false);
			await old.release();
			await routing.start();
			expect(routing.findOwner({ partition })).toEqual({
				partition,
				endpoint: "http://new.test",
				routeEpoch: next.routeEpoch,
			});
			await successor.release();
			await routing.refresh();
			expect(routing.findOwner({ partition })).toBeUndefined();
		} finally {
			await first.disconnect();
			await second.disconnect();
			await routing.stop();
			await log.disconnect?.();
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
		}
	});
});
