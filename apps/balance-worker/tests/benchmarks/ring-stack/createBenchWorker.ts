/**
 * The ring stack on bench fixtures: the real HTTP worker pool, inline handler, held replies and processor over one
 * partition, a fake Kafka that acks each append after FAKE_KAFKA_MS, and the mixed population of the serial-decide
 * bench: hot `cus_1`, warm `cus_w<i>`, reset-due `cus_r<i>`, and `cus_c<i>` served by a Postgres stand-in.
 * INLINE=off swaps the inline handler for a pass-through, so every request takes the ordinary route.
 */
import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { createCommitterStateStore } from "../../../src/committer/createCommitterStateStore.js";
import type { Committer } from "../../../src/committer/types/committer.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import {
	createInlineHandler,
	INLINE_ROUTES,
} from "../../../src/http/handlers/inline/createInlineHandler.js";
import { heldFailureOf } from "../../../src/http/handlers/inline/heldFailureOf.js";
import { createHttpWorkerPool } from "../../../src/http/workerThreads/createHttpWorkerPool.js";
import { connectHeldReplies } from "../../../src/init/construction/connectHeldReplies.js";
import { createPartitionCommitLogging } from "../../../src/logging/createPartitionCommitLogging.js";
import { createEventLoopStallMonitor } from "../../../src/logging/eventLoopStalls/createEventLoopStallMonitor.js";
import { syncSections } from "../../../src/logging/eventLoopStalls/syncSections.js";
import { getBalanceWorkerLogger } from "../../../src/logging/getBalanceWorkerLogger.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { CommittedOutcomeAppender } from "../../../src/processor/writer/types/partitionWriter.js";
import { createCommitPositions } from "../../../src/runtime/commitPositions/createCommitPositions.js";
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

const TOPIC = "bw-bench-metering";
const PARTITION = 0;
const population = {
	warm: Number(process.env.MIX_WARM ?? 2_000),
	resetDue: Number(process.env.MIX_RESET ?? 2_500),
	dbMs: Number(process.env.MIX_DB_MS ?? 3),
};
const fakeKafkaMs = Number(process.env.FAKE_KAFKA_MS ?? 3);

/** Present from D on; older heads run without them, as their own worker does. */
const signals = {
	counters: await import(
		"../../../src/http/handlers/inline/inlineCounters.js"
	).catch(() => null),
	commits: await import("../../../src/logging/commitSummaries.js").catch(
		() => null,
	),
};

const identityOf = (customerId: string): MeteringIdentity => ({
	...testIdentity,
	customerId,
});

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

/** Postgres for the population: any customer exists, after the configured read latency. */
function populationDb({
	stateFor,
}: {
	stateFor: (params: { identity: MeteringIdentity }) => SubjectState;
}): WorkerDb {
	async function getSubjectRows({ identity }: { identity: MeteringIdentity }) {
		if (population.dbMs > 0) await Bun.sleep(population.dbMs);
		return envelopeOf(stateFor({ identity }));
	}
	return {
		...createSyntheticWorkerDb(),
		getSubjectRows,
		getEntitySubjectRows: entitySubjectRowsFrom({ getSubjectRows }),
	};
}

/** Kafka that takes every append and acks it after `fakeKafkaMs`. */
function fakeKafkaAppender(): CommittedOutcomeAppender {
	let nextOffset = 0n;
	async function appendCommitted({
		outcomes,
	}: {
		outcomes: unknown[];
	}): Promise<{ baseOffset: bigint }> {
		const baseOffset = nextOffset;
		nextOffset += BigInt(outcomes.length);
		await Bun.sleep(fakeKafkaMs);
		return { baseOffset };
	}
	return { appendCommitted } as unknown as CommittedOutcomeAppender;
}

function noStore(): ReturnType<typeof createCommitterStateStore> {
	const committer: Committer = {
		async apply({ records, expectedOffset }) {
			const last = records.at(-1);
			return { nextOffset: last ? last.position.offset + 1n : expectedOffset };
		},
		drain: async () => undefined,
		stop: () => undefined,
	};
	return createCommitterStateStore({
		ctx: {
			committer,
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
}

export async function createBenchWorker({
	port,
	httpWorkers,
	inline,
}: {
	port: number;
	httpWorkers: number;
	inline: boolean;
}) {
	const scenario = scenarios.typical;
	if (!scenario) throw new Error("scenario");
	const logger = getBalanceWorkerLogger();
	const store = noStore();
	await store.initializePartition({
		topic: TOPIC,
		partition: PARTITION,
		nextOffset: 0n,
	});
	const commitPositions = createCommitPositions({
		config: { partitionCount: 1 },
	});
	const commitLogging = createPartitionCommitLogging({
		ctx: {
			appender: fakeKafkaAppender(),
			stateStore: store,
			logger,
			...(signals.commits && { summaries: signals.commits.commitSummaries }),
		},
		config: { deployment: "bench", endpoint: `http://127.0.0.1:${port}` },
	});
	const db = populationDb({ stateFor: scenario.stateFor });
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...commitLogging.stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			} as Parameters<typeof createPartitionProcessor>[0]["ctx"]["stateStore"],
			catalogCache: createTestCatalogCache({ db, rows: scenario.catalogRows }),
			db,
			appender: commitLogging.appender,
			receiptPolicy: { retentionMs: 86_400_000, now: () => Date.now() },
			recentCommands: createRecentCommands({
				windowMs: 600_000,
				now: () => Date.now(),
			}),
			commitPositions: commitPositions.sinkFor({ partition: PARTITION }),
			assertCanRead: () => undefined,
		},
		config: {
			topic: TOPIC,
			partition: PARTITION,
			writerLimits: {
				maxBatchSize: 500,
				maxPendingCommands: 4000,
				maxPendingCommandsPerCustomer: 1000,
				commitLingerMs: 5,
			},
		},
	});
	const residents = [
		scenario.stateFor({ identity: testIdentity }),
		...Array.from({ length: population.warm }, (_, i) =>
			scenario.stateFor({ identity: identityOf(`cus_w${i}`) }),
		),
		...Array.from({ length: population.resetDue }, (_, i) =>
			resetDueState(scenario.stateFor({ identity: identityOf(`cus_r${i}`) })),
		),
	];
	for (let at = 0; at < residents.length; at += 500)
		await Promise.all(
			residents.slice(at, at + 500).map((state, i) =>
				processor.initialize({
					request: createInitializeRequest({
						state,
						commandId: `init_${at + i}`,
						requestId: `req_init_${at + i}`,
					}),
				}),
			),
		);

	const runtime = {
		process: <Decision>(run: (p: typeof processor) => Promise<Decision>) =>
			run(processor),
		processInline: <Decision>(run: (p: typeof processor) => Decision | null) =>
			run(processor),
	};
	const ctx = {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => PARTITION },
		logger,
		requestLog: {
			successSampleRate: Number(process.env.LOG_RATE ?? 0.05),
		},
	};
	const counters = signals.counters?.createInlineCounters();
	const handler = inline
		? createInlineHandler({ ctx: { ...ctx, counters } as never })
		: () => null;
	const listener = await createHttpWorkerPool({
		ctx: {
			fetch: createBalanceWorkerApp({ ctx: ctx as never }).fetch,
			logger,
			onFatal: ({ cause }) => {
				console.error(`FATAL ${String(cause)}`);
				process.exit(1);
			},
		},
		config: {
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1_000_000,
			threads: httpWorkers,
			requestRingBytes: 4 << 20,
			replyRingBytes: 16 << 20,
			inline: {
				routes: INLINE_ROUTES,
				handler,
				commitCells: commitPositions.cells,
				failureCounts: commitPositions.failureCounts,
			},
		},
	}).listen();
	const disconnect = connectHeldReplies({
		positions: commitPositions,
		http: listener,
		renderFailure: heldFailureOf,
	});
	const pool = listener as typeof listener & {
		drainHealth?: () => Record<string, number>;
		drainLatencies?: () => Record<string, unknown>;
	};
	/** As the worker closes a window: per-partition commit lines out, signals onto the summary line. */
	function windowSignals() {
		signals.commits?.logCommitWindows({
			ctx: { logger, summaries: signals.commits.commitSummaries },
			config: { deployment: "bench", endpoint: `http://127.0.0.1:${port}` },
		});
		return {
			...(counters && { inline: counters.drain() }),
			...(pool.drainHealth && { threads: pool.drainHealth() }),
			...(pool.drainLatencies && { latencyMs: pool.drainLatencies() }),
		};
	}
	const monitor = createEventLoopStallMonitor({
		ctx: { logger, recorder: syncSections, signals: windowSignals } as never,
		config: {
			deployment: "bench",
			endpoint: `http://127.0.0.1:${port}`,
			intervalMs: 10,
			stallThresholdMs: 20,
			logStallMs: 50,
			reportEveryMs: 10_000,
		},
	});
	monitor.start();
	async function stop(): Promise<void> {
		monitor.stop();
		await listener.stop();
		disconnect();
	}
	return { stop };
}
