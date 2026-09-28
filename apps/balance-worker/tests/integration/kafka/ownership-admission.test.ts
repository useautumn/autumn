import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
	parseReadSubjectStateCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import {
	BalanceWorkerClientError,
	createBalanceWorkerClient,
} from "@autumn/balance-worker-client";
import {
	createOwnershipConsumer,
	createProducerSession,
	meteringIdentityToPartition,
	type PartitionOwner,
	serializeMeteringRecord,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import { createWorkerConsumerConfig } from "../../../src/init/workerConfig.js";
import { createOwnershipHandoffLink } from "../../../src/kafka/createOwnershipHandoffLink.js";
import { createOwnershipPublisher } from "../../../src/kafka/createOwnershipPublisher.js";
import {
	createWorkerProducer,
	createWorkerProducerConfig,
} from "../../../src/kafka/createWorkerProducer.js";
import { createPartitionBootstrapper } from "../../../src/runtime/bootstrap/createPartitionBootstrapper.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import { createFakeIdempotencyKeys } from "../../fixtures/idempotencyKeys.js";
import {
	createCustomerEntitlement,
	createInitializeMutation,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";

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
		const store = openStateStore({
			databasePath: join(directory, "state.sqlite"),
		});
		for (const partition of [0, 1, 2])
			store.initializePartition({ topic, partition, nextOffset: 0n });
		const state = createSubjectState({
			identity: {
				orgId: "org_1",
				env: "sandbox",
				customerId: "customer",
				entityId: null,
			},
			customerEntitlements: [
				createCustomerEntitlement({
					id: "balance",
					featureId: "messages",
					balance: 10,
				}),
			],
		});
		restoreSubjectStates({ store, topic, partition, states: [state] });
		const lifecycle: string[] = [];
		const errors: unknown[] = [];
		const factory = createPartitionRuntimeFactory({
			ctx: {
				kafka,
				ownershipOffsets: admin,
				stateStore: store,
				db: createSyntheticWorkerDb(),
				catalogCache: createTestCatalogCache(),
				bootstrapper: createPartitionBootstrapper({
					stateStore: store,
					checkpointSource: { latest: async () => null },
					partitionResolver: { partitionForIdentity: () => partition },
					restoreLimits: {
						maxSerializedBytes: 1_000_000,
						maxStates: 100,
						maxReceipts: 100,
					},
					retryPolicy: { maxAttempts: 1, initialBackoffMs: 1, maxBackoffMs: 1 },
				}),
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
				idempotencyKeys: createFakeIdempotencyKeys().keys,
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
							...resources.publication,
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
				handoffReadyTimeoutMs: 100,
				handoffClaimTimeoutMs: 100,
			},
		});
		const routing = createOwnershipConsumer({
			ctx: { kafka },
			config: { topic: owners },
		});
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
					org: {
						config: {
							reverse_deduction_order: false,
							block_overdue_entitlements: false,
							include_past_due: true,
						},
					},
					commandId: id,
					requestId: id,
					identity: state.identity,
					featureId: "messages",
					internalFeatureId: "feat_messages",
					value: 5,
					overageBehavior: "reject",
					properties: null,
					usageEvent: { name: "messages", idempotencyKey: null, id: null },
					occurredAt: Date.now(),
				},
			});
			const submitted = admitted.process((processor) =>
				processor.track({ command }),
			);
			const stopping = worker.stop();
			// No successor announces itself, so the route stays up until the ready wait times out.
			await waitFor(
				() => worker.findRuntime(owner as PartitionOwner) === undefined,
			);
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
		const routing = createOwnershipConsumer({
			ctx: { kafka },
			config: { topic: owners },
		});
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
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
		}
	});
});

/** Two workers in one group, each with its own listener, store and ownership link, the way a fleet runs. */
describe("Partition handoff under load", () => {
	const partitionCount = 3;
	type LiveWorker = Awaited<ReturnType<typeof startWorker>>;

	async function startWorker({
		name,
		kafka,
		admin,
		id,
		topic,
		owners,
		events,
		errors,
	}: {
		name: string;
		kafka: Kafka;
		admin: ReturnType<Kafka["admin"]>;
		id: string;
		topic: string;
		owners: string;
		events: string[];
		errors: unknown[];
	}) {
		const directory = mkdtempSync(join(tmpdir(), `handoff-${name}-`));
		const store = openStateStore({
			databasePath: join(directory, "state.sqlite"),
		});
		const reservation = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: () => new Response(),
		});
		const port = reservation.port;
		await reservation.stop();
		const endpoint = `http://127.0.0.1:${port}`;
		const partitionResolver = {
			partitionForIdentity: ({ identity }: { identity: MeteringIdentity }) =>
				meteringIdentityToPartition({ identity, partitionCount }),
		};
		const ownershipHandoff = createOwnershipHandoffLink({
			ctx: { kafka },
			config: { topic: owners, producerLimits },
		});
		const factory = createPartitionRuntimeFactory({
			ctx: {
				kafka,
				ownershipOffsets: admin,
				ownershipHandoff,
				stateStore: store,
				db: createSyntheticWorkerDb(),
				catalogCache: createTestCatalogCache(),
				bootstrapper: createPartitionBootstrapper({
					stateStore: store,
					checkpointSource: { latest: async () => null },
					partitionResolver,
					restoreLimits: {
						maxSerializedBytes: 10_000_000,
						maxStates: 1_000,
						maxReceipts: 10_000,
					},
					retryPolicy: { maxAttempts: 1, initialBackoffMs: 1, maxBackoffMs: 1 },
				}),
				partitionResolver,
			},
			config: {
				deploymentEnvironment: id,
				ownership: { topic: owners, endpoint },
				checkpointRestoreLimits: {
					maxSerializedBytes: 10_000_000,
					maxStates: 1_000,
					maxReceipts: 10_000,
				},
				checkpointRetryPolicy: {
					maxAttempts: 1,
					initialBackoffMs: 1,
					maxBackoffMs: 1,
				},
				writerLimits: {
					maxBatchSize: 100,
					maxPendingCommands: 1_000,
					maxPendingCommandsPerCustomer: 100,
				},
				trackReceiptRetentionMs: 86_400_000,
				producerLimits,
				timings,
			},
		});
		const partitions = createWorkerPartitions({
			ctx: {
				consumer: kafka.consumer(
					createWorkerConsumerConfig({ groupId: id, timings }),
				),
				partitionOffsets: kafka.admin(),
				stateStore: store,
				idempotencyKeys: createFakeIdempotencyKeys().keys,
				createRuntime: (params) => {
					const resources = factory(params);
					const { publication } = resources;
					return {
						...resources,
						publication: {
							...publication,
							claim: async (claimParams) => {
								const result = await publication.claim(claimParams);
								events.push(
									`${name}:claim:${params.partition}:${claimParams?.endpoint ?? endpoint}`,
								);
								return result;
							},
							release: async () => {
								await publication.release();
								events.push(`${name}:release:${params.partition}`);
							},
						},
					};
				},
				ownershipLink: ownershipHandoff,
				onError: ({ cause }) => errors.push(cause),
				onUnhealthyPartition: ({ cause }) => errors.push(cause),
			},
			config: {
				topic,
				partitionsConsumedConcurrently: partitionCount,
				healthRefreshIntervalMs: 5_000,
			},
		});
		const app = createBalanceWorkerApp({
			ctx: {
				ownership: partitions,
				partitionResolver,
				logger: { debug() {}, info() {}, warn() {}, error() {} },
			},
		});
		const listener = Bun.serve({
			hostname: "127.0.0.1",
			port,
			fetch: app.fetch,
			idleTimeout: 0,
		});
		await partitions.start();
		let stopped: Promise<void> | undefined;
		async function stop(): Promise<void> {
			stopped ??= (async () => {
				await partitions.stop();
				await listener.stop();
				store.close();
				rmSync(directory, { recursive: true, force: true });
			})();
			return stopped;
		}
		function ownedPartitions(): number[] {
			return partitions
				.partitions()
				.filter(({ status }) => status === "ready")
				.map(({ partition }) => partition);
		}
		return { name, endpoint, partitions, stop, ownedPartitions };
	}

	test("join and graceful leave under a track hammer: every track is a 200 and lands exactly once", async () => {
		const id = crypto.randomUUID();
		const topic = `handoff-worker-${id}`;
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
				{ topic, numPartitions: partitionCount, replicationFactor: 1 },
				{
					topic: owners,
					numPartitions: partitionCount,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
		// One customer per partition, initialized on the log so any worker can rebuild it.
		const customers = new Map<number, ReturnType<typeof createSubjectState>>();
		for (let index = 0; customers.size < partitionCount; index++) {
			const identity = {
				orgId: "org_1",
				env: "sandbox",
				customerId: `cus_${index}`,
				entityId: null,
			} as const;
			const partition = meteringIdentityToPartition({
				identity,
				partitionCount,
			});
			if (customers.has(partition)) continue;
			customers.set(
				partition,
				createSubjectState({
					identity,
					customerEntitlements: [
						createCustomerEntitlement({
							id: "balance",
							featureId: "messages",
							balance: 1_000_000,
						}),
					],
				}),
			);
		}
		const seed = kafka.producer();
		await seed.connect();
		for (const [partition, state] of customers)
			await seed.send({
				topic,
				messages: [
					{
						partition,
						...serializeMeteringRecord({
							record: createInitializeMutation({
								state,
								commandId: `init_${partition}`,
							}),
						}),
					},
				],
			});
		await seed.disconnect();

		const events: string[] = [];
		const errors: unknown[] = [];
		const outcomes: { partition: number; outcome: string }[] = [];
		const routing = createOwnershipConsumer({
			ctx: { kafka },
			config: { topic: owners },
		});
		const client = createBalanceWorkerClient({
			ctx: { owners: routing },
			config: {
				partitionCount,
				timeoutMs: 1_000,
				routeRefreshTimeoutMs: 200,
			},
		});
		async function trackOnce(partition: number): Promise<void> {
			const state = customers.get(partition);
			if (!state) throw new Error(`No customer on partition ${partition}`);
			const commandId = crypto.randomUUID();
			const command = parseTrackCommand({
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
					commandId,
					requestId: commandId,
					identity: state.identity,
					featureId: "messages",
					internalFeatureId: "feat_messages",
					value: 1,
					overageBehavior: "reject",
					properties: null,
					usageEvent: { name: "messages", idempotencyKey: null, id: null },
					occurredAt: Date.now(),
				},
			});
			let outcome = "200";
			try {
				await client.track({ command });
			} catch (cause) {
				outcome =
					cause instanceof BalanceWorkerClientError
						? `${cause.code}${cause.workerCode ? `:${cause.workerCode}` : ""}`
						: `THROW:${String(cause)}`;
			}
			outcomes.push({ partition, outcome });
		}
		let hammering = false;
		const hammers: Promise<void>[] = [];
		function startHammer(): void {
			hammering = true;
			for (const partition of customers.keys())
				hammers.push(
					(async () => {
						while (hammering) {
							void trackOnce(partition);
							await Bun.sleep(50);
						}
					})(),
				);
		}
		const workerContext = { kafka, admin, id, topic, owners, events, errors };
		const A = await startWorker({ name: "A", ...workerContext });
		let B: LiveWorker | undefined;
		try {
			await waitFor(() => A.ownedPartitions().length === partitionCount);
			await routing.start();
			for (const partition of customers.keys()) await trackOnce(partition);
			expect(outcomes.map(({ outcome }) => outcome)).toEqual([
				"200",
				"200",
				"200",
			]);
			startHammer();
			await Bun.sleep(500);

			// JOIN: B takes some partitions from A; each moves by handoff, never by release.
			B = await startWorker({ name: "B", ...workerContext });
			const joined = B;
			await waitFor(
				() =>
					joined.ownedPartitions().length > 0 &&
					A.ownedPartitions().length + joined.ownedPartitions().length ===
						partitionCount,
			);
			const moved = joined.ownedPartitions();
			expect(moved.length).toBeGreaterThan(0);
			for (const partition of moved) {
				expect(events).toContain(`A:claim:${partition}:${joined.endpoint}`);
				expect(events).not.toContain(`A:release:${partition}`);
			}
			await Bun.sleep(1_000);

			// GRACEFUL LEAVE: B leaves the group and hands its partitions back to A.
			await joined.stop();
			await waitFor(() => A.ownedPartitions().length === partitionCount);
			for (const partition of moved) {
				expect(events).toContain(`B:claim:${partition}:${A.endpoint}`);
				expect(events).not.toContain(`B:release:${partition}`);
			}
			await Bun.sleep(1_000);
			hammering = false;
			await Promise.all(hammers);
			await Bun.sleep(1_500);

			const failures = outcomes.filter(({ outcome }) => outcome !== "200");
			expect(failures).toEqual([]);
			expect(outcomes.length).toBeGreaterThan(60);
			// Applied exactly once: the balance dropped by one per 200, no more, no less.
			for (const [partition, state] of customers) {
				const reply = await client.readSubjectState({
					command: parseReadSubjectStateCommand({
						input: {
							schemaVersion: 1,
							type: "readSubjectState",
							requestId: crypto.randomUUID(),
							identity: state.identity,
							occurredAt: Date.now(),
							org: {
								config: {
									reverse_deduction_order: false,
									block_overdue_entitlements: false,
									include_past_due: true,
								},
							},
						},
					}),
				});
				const balance = reply.state.customerEntitlements[0]?.balance;
				const served = outcomes.filter(
					(outcome) => outcome.partition === partition,
				).length;
				expect(balance).toBe(1_000_000 - served);
			}
			expect(errors).toEqual([]);
		} finally {
			hammering = false;
			await Promise.allSettled(hammers);
			await B?.stop();
			await A.stop();
			await routing.stop();
			await admin.deleteTopics({ topics: [topic, owners] });
			await admin.disconnect();
		}
	}, 120_000);
});
