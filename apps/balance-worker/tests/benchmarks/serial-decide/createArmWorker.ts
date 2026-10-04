/**
 * The production serial-decide arms over the spike's fixtures: one partition, one hot customer, the
 * `typical` catalog, prod writer limits, idempotent commits against the local broker.
 *   A  classic Bun.serve, producers in-thread                     (today's layout)
 *   B  I/O worker pool, producers in-thread
 *   C  I/O worker pool + Kafka worker thread
 *   D  C + hot track frames: lean decide, replies released by commit position, hashed dedup window
 * Every arm runs the real processor, writer, pool, Kafka worker and hot decider; only the fixtures are synthetic.
 * SPIKE_MIX=1 adds a many-customer population (see `mixPopulation`): warm residents, residents with a reset due,
 * and customers Postgres serves on first touch after SPIKE_MIX_DB_MS.
 */

import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import {
	createKafkaClient,
	createKafkaTransport,
	createProducerSession,
	type KafkaProducerFactory,
} from "@autumn/kafka";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { Kafka } from "kafkajs";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import { createWorkerProducerConfig } from "../../../src/init/workerConfig.js";
import { WORKER_KAFKA_CLIENT_LIMITS } from "../../../src/init/workerResources.js";
import { createMutationPublisher } from "../../../src/kafka/createMutationPublisher.js";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createHashedRecentCommands } from "../../../src/processor/writer/recentCommands/createHashedRecentCommands.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createHotDecider } from "../../../src/serialDecide/createHotDecider.js";
import { createIoWorkerPool } from "../../../src/serialDecide/createIoWorkerPool.js";
import { createRemoteKafkaProducers } from "../../../src/serialDecide/createRemoteKafkaProducers.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";
import type { WorkerDb } from "../../../src/types/workerDb.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
	entitySubjectRowsFrom,
} from "../../fixtures/catalog.js";
import {
	createInitializeRequest,
	testIdentity,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

// The equality run pins the wall clock so two arms build the same records from the same requests.
const fixedClock = process.env.SPIKE_FIXED_CLOCK;
if (fixedClock) Date.now = () => Number(fixedClock);

export type Arm = "A" | "B" | "C" | "D";

/** The mixed population: `cus_w<i>` warm and `cus_r<i>` reset-due residents, `cus_c<i>` served by Postgres. */
export const mixPopulation = {
	enabled: process.env.SPIKE_MIX === "1",
	warm: Number(process.env.SPIKE_MIX_WARM ?? 2_000),
	resetDue: Number(process.env.SPIKE_MIX_RESET ?? 2_500),
	dbMs: Number(process.env.SPIKE_MIX_DB_MS ?? 3),
};

const identityOf = (customerId: string): MeteringIdentity => ({
	...testIdentity,
	customerId,
});

/** A resident whose cycles ended a minute before the requests' clock: its first command advances them. */
function resetDueState(state: SubjectState): SubjectState {
	const endedAt = testOccurredAt - 60_000;
	return {
		...state,
		customerEntitlements: state.customerEntitlements.map((row) => ({
			...row,
			next_reset_at: endedAt,
			reset_cycle_anchor: endedAt - 30 * 86_400_000,
		})),
	};
}

/** The rows Postgres would hand back for a customer: the state's own rows, after the configured latency. */
function envelopeOf(state: SubjectState): SubjectRowsEnvelope {
	return {
		customer: state.customer,
		customer_products: state.customerProducts,
		customer_prices: state.customerPrices,
		customer_entitlements: state.customerEntitlements,
		rollovers: state.rollovers,
		replaceables: state.replaceables,
		usage_windows: state.usageWindows,
		open_locks: state.openLocks,
		pooled_balances: state.pooledBalances,
		customer_licenses: state.customerLicenses,
		entity: state.entity,
	} as unknown as SubjectRowsEnvelope;
}
export const SPIKE_TOPIC = process.env.SPIKE_TOPIC ?? "bw-spike-metering";
export const SPIKE_BROKERS = ["127.0.0.1:19092"];
const PARTITION = 0;
const producerLimits = {
	transactionTimeoutMs: 30_000,
	retryCount: 8,
	initialRetryTimeMs: 5,
	maxRetryTimeMs: 1000,
};

function fatal({ cause }: { cause: unknown }): void {
	console.error(`FATAL ${String(cause)}`);
	process.exit(1);
}

export async function createArmWorker({
	arm,
	port,
	ioWorkers,
}: {
	arm: Arm;
	port: number;
	ioWorkers: number;
}): Promise<{
	listen(): Promise<{ stop(): Promise<void> | void }>;
	readStats(): Record<string, unknown>;
}> {
	const scenario = scenarios[process.env.SPIKE_SCENARIO ?? "typical"];
	if (!scenario) throw new Error("scenario");
	const logger = getBalanceWorkerLogger();
	const clientConfig = {
		clientId: `bw-arm-${arm}-${process.pid}`,
		brokers: SPIKE_BROKERS,
		authMode: "none" as const,
		limits: WORKER_KAFKA_CLIENT_LIMITS,
	};
	const remote =
		arm === "C" || arm === "D"
			? createRemoteKafkaProducers({
					ctx: { logger, onFatal: fatal },
					config: clientConfig,
				})
			: null;
	if (remote) await remote.start();
	const kafka: KafkaProducerFactory =
		remote ??
		new Kafka(
			createKafkaClient({
				...clientConfig,
				transport: createKafkaTransport({ authMode: "none" }),
			}),
		);
	const session = createProducerSession({
		ctx: { kafka },
		config: createWorkerProducerConfig({
			deploymentEnvironment: "spike",
			topic: SPIKE_TOPIC,
			partition: PARTITION,
			limits: producerLimits,
			mode: "idempotent",
		}),
	});
	const producer = createWorkerProducer({
		ctx: { session, ownerEpoch: () => "1" },
		config: { topic: SPIKE_TOPIC, partition: PARTITION },
	});
	await producer.connect();
	await producer.fence();
	const appender = createMutationPublisher({
		ctx: { producer, commit: { mode: "idempotent" }, ownerEpoch: () => "1" },
	});

	const committer: Committer = {
		async apply({ records, expectedOffset }) {
			const last = records.at(-1);
			return {
				nextOffset: last ? last.position.offset + 1n : expectedOffset,
			};
		},
		drain: async () => undefined,
		stop: () => undefined,
	};
	const stateStore = createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await stateStore.initializePartition({
		topic: SPIKE_TOPIC,
		partition: PARTITION,
		nextOffset: 0n,
	});
	const positions = createPositionBoard({ config: { partitionCount: 1 } });
	const db: WorkerDb = mixPopulation.enabled
		? mixDb({ stateFor: scenario.stateFor })
		: createSyntheticWorkerDb();
	const dedupWindow = { windowMs: 600_000, now: () => Date.now() };
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache: createTestCatalogCache({ db, rows: scenario.catalogRows }),
			db,
			appender,
			receiptPolicy: { retentionMs: 86_400_000, now: () => Date.now() },
			recentCommands:
				arm === "D"
					? createHashedRecentCommands(dedupWindow)
					: createRecentCommands(dedupWindow),
			positions:
				arm === "D" ? positions.sinkFor({ partition: PARTITION }) : undefined,
			assertCanRead: () => undefined,
		},
		config: {
			topic: SPIKE_TOPIC,
			partition: PARTITION,
			writerLimits: {
				maxBatchSize: 500,
				maxPendingCommands: 4000,
				maxPendingCommandsPerCustomer: 1000,
				commitLingerMs: 5,
				commitPipelineDepth: 2,
			},
			// Staging runs with check leases off (prod parity).
			issuesCheckLeases: process.env.SPIKE_CHECK_LEASES === "true",
		},
	});
	await processor.initialize({
		request: createInitializeRequest({
			state: scenario.stateFor({ identity: testIdentity }),
			commandId: "init_0",
			requestId: "req_init_0",
		}),
	});
	if (mixPopulation.enabled) {
		const residents = [
			...Array.from({ length: mixPopulation.warm }, (_, i) => {
				const identity = identityOf(`cus_w${i}`);
				return scenario.stateFor({ identity });
			}),
			...Array.from({ length: mixPopulation.resetDue }, (_, i) =>
				resetDueState(scenario.stateFor({ identity: identityOf(`cus_r${i}`) })),
			),
		];
		for (let at = 0; at < residents.length; at += 500)
			await Promise.all(
				residents.slice(at, at + 500).map((state, i) =>
					processor.initialize({
						request: createInitializeRequest({
							state,
							commandId: `init_mix_${at + i}`,
							requestId: `req_init_mix_${at + i}`,
						}),
					}),
				),
			);
	}

	const runtime: BalanceWorkerRequestContext["runtime"] = {
		process: (run) => run(processor),
		...(arm === "D" && { processHot: (run) => run(processor) }),
	};
	const ctx: BalanceWorkerHttpContext = {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => PARTITION },
		logger,
		requestLog: {
			successSampleRate: Number(process.env.SPIKE_LOG_RATE ?? 0.05),
		},
	};
	const app = createBalanceWorkerApp({ ctx });
	const fetch = createBalanceWorkerFetch({ ctx, app });

	const pool =
		arm === "A"
			? null
			: createIoWorkerPool({
					ctx: {
						fetch,
						logger,
						onFatal: fatal,
						hot:
							arm === "D"
								? {
										decider: createHotDecider({
											ctx,
											config: { partitionCount: 1 },
										}),
										positions,
									}
								: undefined,
					},
					config: {
						hostname: "127.0.0.1",
						port,
						maxRequestBodySize: 1_000_000,
						workers: ioWorkers,
					},
				});

	async function listen() {
		if (pool) {
			const listener = await pool.listen();
			return {
				stop: async () => {
					await listener.stop();
					await remote?.stop();
				},
			};
		}
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1_000_000,
			fetch,
			idleTimeout: 0,
		});
		return { stop: () => server.stop(true) };
	}

	function readStats(): Record<string, unknown> {
		return {
			arm,
			counters: processor.readCounters(),
			...(pool && { pool: pool.readStats() }),
			...(remote && { kafka: remote.readStats() }),
			commitPos: positions.readCommitPos({ partition: PARTITION }),
		};
	}

	return { listen, readStats };
}

/** Postgres for the mixed population: any customer exists, after the configured read latency. */
function mixDb({
	stateFor,
}: {
	stateFor: (params: { identity: MeteringIdentity }) => SubjectState;
}): WorkerDb {
	const synthetic = createSyntheticWorkerDb();
	async function getSubjectRows({
		identity,
	}: {
		identity: MeteringIdentity;
	}): Promise<SubjectRowsEnvelope | null> {
		if (mixPopulation.dbMs > 0) await Bun.sleep(mixPopulation.dbMs);
		return envelopeOf(stateFor({ identity }));
	}
	return {
		...synthetic,
		getSubjectRows,
		getEntitySubjectRows: entitySubjectRowsFrom({ getSubjectRows }),
	};
}
