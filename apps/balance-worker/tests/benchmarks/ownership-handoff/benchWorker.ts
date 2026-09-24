/**
 * One balance worker in its own process, wired exactly like createBalanceWorker
 * but with the partition runtime and the group consumer instrumented so every
 * lifecycle step lands on stdout as a JSON line with a wall-clock timestamp.
 * SIGTERM runs worker.stop() (the main.ts path); SIGKILL from the orchestrator
 * is the hard-kill scenario.
 */
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createPartitionRuntimeFactory } from "../../../src/init/construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "../../../src/init/construction/createWorkerPartitions.js";
import { resolveWorkerAddress } from "../../../src/init/resolveWorkerAddress.js";
import type { PartitionRuntimeFactoryInput } from "../../../src/init/types/partitionRuntimeFactory.js";
import { createWorkerCheckpointConfig } from "../../../src/init/workerCheckpointConfig.js";
import {
	balanceWorkerEnvToRuntimeConfig,
	createWorkerConsumerConfig,
} from "../../../src/init/workerConfig.js";
import { openWorkerResources } from "../../../src/init/workerResources.js";
import type { StateBackend } from "../../../src/state/stateBackend.js";

const env = JSON.parse(process.env.BENCH_WORKER_ENV ?? "null") as
	| (BalanceWorkerEnv & { BENCH_NAME: string; BENCH_BACKEND: StateBackend })
	| null;
if (!env) throw new Error("BENCH_WORKER_ENV is required");
const name = env.BENCH_NAME;

function emit(event: string, fields: Record<string, unknown> = {}): void {
	process.stdout.write(
		`${JSON.stringify({ t: Date.now(), worker: name, event, ...fields })}\n`,
	);
}
function ignoreLog(): void {}
const logger = {
	debug: ignoreLog,
	info: ignoreLog,
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

const checkpointConfig = createWorkerCheckpointConfig({ env });
const address = await resolveWorkerAddress({ env });
const runtimeConfig = balanceWorkerEnvToRuntimeConfig({
	env,
	endpoint: address.endpoint,
});
const resources = await openWorkerResources({
	ctx: { logger },
	config: { env, stateBackend: env.BENCH_BACKEND },
	checkpointConfig,
	bootstrap: {
		restoreLimits: runtimeConfig.checkpointRestoreLimits,
		retryPolicy: runtimeConfig.checkpointRetryPolicy,
	},
});
const runtimeFactory = createPartitionRuntimeFactory({
	ctx: {
		logger,
		kafka: resources.kafka,
		ownershipOffsets: resources.admin,
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
	async function start(): Promise<void> {
		emit("runtime.start", { partition });
		let last = runtime.getHealth().status;
		const poll = setInterval(() => {
			const status = runtime.getHealth().status;
			if (status === last) return;
			emit("runtime.status", { partition, from: last, to: status });
			last = status;
		}, 1);
		try {
			await runtime.start();
		} finally {
			clearInterval(poll);
			const status = runtime.getHealth().status;
			if (status !== last)
				emit("runtime.status", { partition, from: last, to: status });
			emit("runtime.started", { partition, status });
		}
	}
	async function drain(): Promise<void> {
		// detachPartitions withdraws the route and calls drain() in the same tick: this is the withdraw moment.
		emit("withdraw", { partition });
		await runtime.drain();
		emit("drained", { partition });
	}
	async function claim(): Promise<{ routeEpoch: string }> {
		emit("claim.start", { partition });
		const result = await built.publication.claim();
		emit("claim.done", { partition, routeEpoch: result.routeEpoch });
		return result;
	}
	async function release(): Promise<void> {
		emit("release.start", { partition });
		await built.publication.release();
		emit("release.done", { partition });
	}
	return {
		runtime: { ...runtime, start, drain },
		publication: { claim, release },
	};
}

const consumer = resources.kafka.consumer(
	createWorkerConsumerConfig({
		groupId: env.BALANCE_WORKER_GROUP_ID,
		timings: runtimeConfig.timings,
	}),
);
consumer.on(consumer.events.REBALANCING, () => emit("consumer.rebalancing"));
consumer.on(consumer.events.GROUP_JOIN, (event) =>
	emit("consumer.group_join", {
		partitions:
			event.payload.memberAssignment[env.BALANCE_WORKER_METERING_TOPIC] ?? [],
		generation: event.payload.groupProtocol,
	}),
);
consumer.on(consumer.events.CRASH, (event) =>
	emit("consumer.crash", { error: describe(event.payload.error) }),
);

const partitions = createWorkerPartitions({
	ctx: {
		consumer,
		partitionOffsets: resources.kafka.admin(),
		stateStore: resources.stateStore,
		idempotencyKeys: resources.idempotencyKeys,
		logger,
		createRuntime,
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
const app = createBalanceWorkerApp({
	ctx: {
		ownership: partitions,
		partitionResolver: resources.partitionResolver,
		logger,
	},
});

emit("worker.starting");
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
await partitions.start();
emit("worker.started");

let stopping: Promise<void> | undefined;
function stop(): Promise<void> {
	stopping ??= (async () => {
		emit("stop.begin");
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
