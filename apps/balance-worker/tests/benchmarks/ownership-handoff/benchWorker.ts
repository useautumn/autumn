/**
 * One balance worker in its own process, wired exactly like createBalanceWorker
 * but with the partition runtime and the group consumer instrumented so every
 * lifecycle step lands on stdout as a JSON line with a wall-clock timestamp.
 * SIGTERM runs worker.stop() (the main.ts path); SIGKILL from the orchestrator
 * is the hard-kill scenario. With BENCH_SERVICE_ARN and BENCH_EDGE_CONFIG_DIR
 * set, the worker is one task of a blue-green fleet: it polls the slot record
 * from that directory and holds its ready announcements until the record names it.
 */
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createKafka,
	createKafkaClient,
	createKafkaTransport,
} from "@autumn/kafka";
import { createSlotGate } from "../../../src/blueGreen/createSlotGate.js";
import { createSlotHeartbeat } from "../../../src/blueGreen/createSlotHeartbeat.js";
import { fleetIdOf } from "../../../src/blueGreen/fleetIdOf.js";
import { subjectLoadGate } from "../../../src/external/postgres/subjectLoadGate.js";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import { resolveWorkerAddress } from "../../../src/init/resolveWorkerAddress.js";
import type { PartitionRuntimeFactoryInput } from "../../../src/init/types/partitionRuntimeFactory.js";
import { createWorkerCheckpointConfig } from "../../../src/init/workerCheckpointConfig.js";
import {
	balanceWorkerEnvToRuntimeConfig,
	createWorkerConsumerConfig,
	workerConsumerGroupIdOf,
} from "../../../src/init/workerConfig.js";
import {
	openWorkerResources,
	WORKER_KAFKA_PRODUCER_LIMITS,
} from "../../../src/init/workerResources.js";
import { createOwnershipHandoffLink } from "../../../src/kafka/createOwnershipHandoffLink.js";
import { databaseTimings } from "../../../src/logging/databaseTimings.js";
import type { StateBackend } from "../../../src/state/stateBackend.js";
import { createDirectoryEdgeConfigClient } from "./directoryEdgeConfigClient.js";
import { installPgLatency } from "./pgLatency.js";
import { createStartupTrace } from "./startupTrace.js";

const env = JSON.parse(process.env.BENCH_WORKER_ENV ?? "null") as
	| (BalanceWorkerEnv & {
			BENCH_NAME: string;
			BENCH_BACKEND: StateBackend;
			BENCH_SERVICE_ARN?: string;
			BENCH_EDGE_CONFIG_DIR?: string;
			BENCH_ADVERTISE_IP?: string;
			BENCH_HEARTBEAT_MS?: number;
	  })
	| null;
if (!env) throw new Error("BENCH_WORKER_ENV is required");
const name = env.BENCH_NAME;

function emit(event: string, fields: Record<string, unknown> = {}): void {
	process.stdout.write(
		`${JSON.stringify({ t: Date.now(), worker: name, event, ...fields })}\n`,
	);
}
function ignoreLog(): void {}
const STEP_DOWN_LINE = /step/i;
function isReported(first: unknown): boolean {
	if (typeof first === "string") return STEP_DOWN_LINE.test(first);
	return typeof first === "object" && first !== null && "event" in first;
}
const logger = {
	debug: ignoreLog,
	info: (...args: unknown[]) => {
		if (isReported(args[0])) emit("log.info", { args: describe(args) });
	},
	warn: (...args: unknown[]) => emit("log.warn", { args: describe(args) }),
	error: (...args: unknown[]) => emit("log.error", { args: describe(args) }),
};
function describe(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (_, item) =>
			item instanceof Error
				? { name: item.name, message: item.message, cause: item.cause }
				: item,
		),
	);
}

// BENCH_PG_DELAY_MS: per-transaction Postgres latency, off until the orchestrator sends SIGUSR2.
if (process.env.BENCH_PG_DELAY_MS)
	installPgLatency({
		medianMs: Number(process.env.BENCH_PG_DELAY_MS),
		sigma: Number(process.env.BENCH_PG_DELAY_SIGMA ?? 0.58),
		onToggle: ({ armed }) => emit("pg_latency", { armed }),
	});
// BENCH_DB_REPORT=1: the balance_worker.database window every second instead of every ten.
if (process.env.BENCH_DB_REPORT === "1")
	setInterval(
		() =>
			emit("db.window", {
				subjectLoads: subjectLoadGate.snapshot(),
				...databaseTimings.drain(),
			}),
		1_000,
	);

const checkpointConfig = createWorkerCheckpointConfig({ env });
const address = env.BENCH_ADVERTISE_IP
	? {
			hostname: "0.0.0.0",
			endpoint: `http://${env.BENCH_ADVERTISE_IP}:${env.BALANCE_WORKER_PORT}`,
		}
	: await resolveWorkerAddress({ env });
/** The fleet's identity handed in instead of read from ECS; the group derives from it exactly as in createBalanceWorker. */
const fleetId = env.BENCH_SERVICE_ARN
	? fleetIdOf({ serviceArn: env.BENCH_SERVICE_ARN })
	: null;
const groupId = workerConsumerGroupIdOf({ env, fleetId });
const runtimeConfig = balanceWorkerEnvToRuntimeConfig({
	env,
	endpoint: address.endpoint,
});
const resources = await openWorkerResources({
	ctx: {
		logger,
		edgeConfigS3Client: env.BENCH_EDGE_CONFIG_DIR
			? createDirectoryEdgeConfigClient({
					directory: env.BENCH_EDGE_CONFIG_DIR,
				})
			: undefined,
	},
	config: { env, stateBackend: env.BENCH_BACKEND },
	checkpointConfig,
	bootstrap: {
		restoreLimits: runtimeConfig.checkpointRestoreLimits,
		retryPolicy: runtimeConfig.checkpointRetryPolicy,
	},
});
const ownershipHandoff = createOwnershipHandoffLink({
	ctx: { kafka: resources.kafka, logger },
	config: {
		topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
		producerLimits: runtimeConfig.producerLimits,
	},
});
const partitionProducers = createKafka(
	createKafkaClient({
		clientId: `balance-worker-producers-${crypto.randomUUID()}`,
		brokers: env.KAFKA_BROKERS,
		transport: createKafkaTransport({
			authMode: env.KAFKA_AUTH_MODE,
			sasl: env.KAFKA_SASL,
		}),
		limits: WORKER_KAFKA_PRODUCER_LIMITS,
	}),
);
const trace = createStartupTrace({
	emit,
	describe,
	topic: env.BALANCE_WORKER_METERING_TOPIC,
	admin: resources.admin,
});
function tracedPartitionProducer(
	producerConfig: Parameters<typeof partitionProducers.producer>[0],
) {
	return trace.traceProducer(partitionProducers.producer(producerConfig));
}
const runtimeFactory = createPartitionRuntimeFactory({
	ctx: {
		logger,
		kafka: { producer: tracedPartitionProducer },
		ownershipOffsets: resources.admin,
		ownershipHandoff,
		stateStore: resources.stateStore,
		db: resources.db,
		catalogCache: resources.catalogCache,
		partitionResolver: resources.partitionResolver,
		bootstrapper: resources.bootstrapper,
		checkpointMaintenance: resources.checkpoints?.maintenance,
	},
	config: runtimeConfig,
});

/** Same as createBalanceWorker's createRuntime, plus timestamps around each startup step. */
function createRuntime(params: PartitionRuntimeFactoryInput) {
	const { partition } = params;
	const built = runtimeFactory(params);
	const runtime = resources.registerRuntime(built.runtime);
	trace.attach({ partition, runtime, follower: params.follower });
	function watchStatus(): () => void {
		let last = runtime.getHealth().status;
		const poll = setInterval(() => {
			const status = runtime.getHealth().status;
			if (status === last) return;
			emit("runtime.status", { partition, from: last, to: status });
			last = status;
		}, 1);
		return () => {
			clearInterval(poll);
			const status = runtime.getHealth().status;
			if (status !== last)
				emit("runtime.status", { partition, from: last, to: status });
		};
	}
	async function prepare(): Promise<void> {
		trace.step("runtime.prepare", partition);
		const stop = watchStatus();
		try {
			await runtime.prepare();
		} finally {
			stop();
			trace.step("runtime.prepared", partition);
		}
	}
	async function activate(): Promise<void> {
		trace.step("runtime.start", partition);
		const stop = watchStatus();
		try {
			await runtime.activate();
		} finally {
			stop();
			const health = runtime.getHealth();
			trace.step("runtime.started", partition, {
				status: health.status,
				failureReason: describe(health.failureReason ?? null),
			});
		}
	}
	async function drain(): Promise<void> {
		// detachPartitions withdraws the route and calls drain() in the same tick: this is the withdraw moment.
		trace.step("withdraw", partition);
		await runtime.drain();
		trace.step("drained", partition);
		trace.detach({ partition });
	}
	async function claim(params?: {
		endpoint: string;
	}): Promise<{ routeEpoch: string }> {
		trace.step("claim.start", partition, { endpoint: params?.endpoint });
		try {
			const result = await built.publication.claim(params);
			if (!params?.endpoint)
				trace.noteClaim({ partition, routeEpoch: result.routeEpoch });
			trace.step("claim.done", partition, {
				routeEpoch: result.routeEpoch,
				endpoint: params?.endpoint,
			});
			return result;
		} catch (cause) {
			trace.step("claim.failed", partition, { error: describe(cause) });
			throw cause;
		}
	}
	async function release(): Promise<void> {
		trace.step("release.start", partition);
		await built.publication.release();
		trace.step("release.done", partition);
	}
	async function announceReady(params?: { readyAt: number }): Promise<void> {
		await built.publication.announceReady(params);
		trace.step("ready.announced", partition, {
			readyAt: params?.readyAt ?? null,
		});
	}
	return {
		runtime: {
			...runtime,
			prepare,
			activate,
			drain,
			fence: trace.traceFence({ partition, runtime }),
		},
		publication: {
			...built.publication,
			...trace.tracePublication({
				partition,
				publication: built.publication,
			}),
			claim,
			release,
			announceReady,
		},
	};
}

const groupConsumer = resources.kafka.consumer(
	createWorkerConsumerConfig({
		groupId,
		timings: runtimeConfig.timings,
	}),
);
const consumer = {
	...groupConsumer,
	...trace.traceConsumer(groupConsumer),
};
consumer.on(consumer.events.REBALANCING, () =>
	trace.noteAllocation("consumer.rebalancing"),
);
consumer.on(consumer.events.GROUP_JOIN, (event) =>
	trace.noteAllocation("consumer.group_join", {
		partitions:
			event.payload.memberAssignment[env.BALANCE_WORKER_METERING_TOPIC] ?? [],
		assignment: event.payload.memberAssignment,
	}),
);
consumer.on(consumer.events.CRASH, (event) =>
	emit("consumer.crash", {
		error: describe(event.payload.error),
		restart: event.payload.restart,
		groupId: event.payload.groupId,
	}),
);

const slotGate =
	env.BENCH_SERVICE_ARN && resources.edgeConfigs
		? createSlotGate({
				ctx: {
					identity: { serviceArn: env.BENCH_SERVICE_ARN, imageSha: null },
					activeSlot: resources.edgeConfigs.activeSlot,
				},
			})
		: undefined;
async function awaitReadyAnnouncement({
	partition,
	signal,
}: {
	partition: number;
	signal: AbortSignal;
}): Promise<void> {
	if (!slotGate) return;
	if (!slotGate.isActive()) emit("slot.hold", { partition });
	await slotGate.awaitActive({ signal });
	emit("slot.active", { partition });
}

const partitions = createWorkerPartitions({
	ctx: {
		consumer,
		partitionOffsets: resources.kafka.admin(),
		commandTopicOffsets: resources.kafka.admin(),
		stateStore: resources.stateStore,
		idempotencyKeys: resources.idempotencyKeys,
		logger,
		createRuntime,
		ownershipLink: ownershipHandoff,
		awaitReadyAnnouncement,
		onError: ({ cause }) => emit("error", { cause: describe(cause) }),
		onUnhealthyPartition: ({ cause }) =>
			emit("unhealthy", { cause: describe(cause) }),
		onServiceStopped: () => emit("service.stopped"),
	},
	config: {
		topic: env.BALANCE_WORKER_METERING_TOPIC,
		commandTopic: env.BALANCE_WORKER_COMMAND_TOPIC,
		partitionsConsumedConcurrently: env.BALANCE_WORKER_PARTITION_COUNT,
		healthRefreshIntervalMs: runtimeConfig.timings.healthRefreshIntervalMs,
	},
});
trace.bindOwnership(partitions);
const app = createBalanceWorkerApp({
	ctx: {
		ownership: trace.traceOwnership(partitions),
		partitionResolver: resources.partitionResolver,
		logger,
	},
});

const heartbeatMs = env.BENCH_HEARTBEAT_MS ?? 2_000;
const slotHeartbeat =
	slotGate && resources.edgeConfigs && env.BENCH_SERVICE_ARN && fleetId
		? createSlotHeartbeat({
				ctx: {
					...resources.edgeConfigs.adminBucket,
					gate: slotGate,
					readPartitions: partitions.partitions,
					isAdmitted: partitions.isAdmitted,
					readAssignmentSettled: partitions.hasAssignment,
					readStoreHealthy: () =>
						resources.edgeConfigs?.activeSlot.getStatus().healthy ?? false,
					probes: {
						kafka: async () => {
							await resources.admin.fetchTopicOffsets(
								env.BALANCE_WORKER_OWNERSHIP_TOPIC,
							);
						},
						postgres: async () => {
							if (!resources.postgres.client)
								throw new Error("No Postgres pool");
							await resources.postgres.client.query("select 1");
						},
					},
					logger,
					schedule: ({ run }) => {
						const timer = setInterval(run, heartbeatMs);
						return () => clearInterval(timer);
					},
				},
				config: {
					deployment: env.BALANCE_WORKER_DEPLOYMENT,
					fleetId,
					endpoint: address.endpoint,
					identity: { serviceArn: env.BENCH_SERVICE_ARN, imageSha: null },
				},
			})
		: undefined;

emit("worker.starting", {
	groupId,
	fleetId,
	pid: process.pid,
	endpoint: address.endpoint,
});
await resources.edgeConfigs?.start();
await resources.catalogInvalidations?.start();
const listener = Bun.serve({
	hostname: address.hostname,
	port: env.BALANCE_WORKER_PORT,
	maxRequestBodySize: env.BALANCE_WORKER_MAX_REQUEST_BYTES,
	fetch: app.fetch,
	idleTimeout: 0,
});
emit("consumer.start");
trace.start();
await partitions.start();
void slotHeartbeat?.start();
emit("worker.started");

let stopping: Promise<void> | undefined;
function stop(): Promise<void> {
	stopping ??= (async () => {
		emit("stop.begin");
		slotHeartbeat?.stop();
		await partitions.stop();
		emit("stop.partitions_stopped");
		await listener.stop();
		await resources.catalogInvalidations?.stop();
		await resources.settleResources();
		resources.closeStore();
		emit("stop.done");
		process.exit(0);
	})();
	return stopping;
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
