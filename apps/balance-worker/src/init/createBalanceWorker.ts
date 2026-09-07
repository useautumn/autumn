import type { PartitionCheckpointV1 } from "../checkpoint/partitionCheckpoint.js";
import { createBalanceWorkerApp } from "../http/createBalanceWorkerApp.js";
import { createPartitionRuntimeFactory } from "./construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "./construction/createWorkerPartitions.js";
import { startWorker } from "./lifecycle/startWorker.js";
import { stopWorker } from "./lifecycle/stopWorker.js";
import { resolveWorkerAddress } from "./resolveWorkerAddress.js";
import type {
	BalanceWorker,
	BalanceWorkerConfig,
	BalanceWorkerDependencies,
	WorkerLifecycleContext,
	WorkerListener,
} from "./types/balanceWorker.js";
import type { BalanceWorkerState } from "./types/balanceWorkerState.js";
import type {
	ConstructedPartitionRuntime,
	PartitionRuntimeFactoryInput,
} from "./types/partitionRuntimeFactory.js";
import {
	balanceWorkerEnvToRuntimeConfig,
	createWorkerConsumerConfig,
} from "./workerConfig.js";
import { openWorkerResources } from "./workerResources.js";

export async function createBalanceWorker({
	ctx: dependencies,
	config,
}: {
	ctx: BalanceWorkerDependencies;
	config: BalanceWorkerConfig;
}): Promise<BalanceWorker> {
	const { env } = config;
	const address = await resolveWorkerAddress({ env });
	const runtimeConfig = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: address.endpoint,
	});
	const resources = await openWorkerResources({ config });
	try {
		const runtimeFactory = createPartitionRuntimeFactory({
			ctx: {
				kafka: resources.kafka,
				ownershipOffsets: resources.admin,
				stateStore: resources.stateStore,
				partitionResolver: resources.partitionResolver,
				checkpointSource: dependencies.checkpointSource ?? { latest },
			},
			config: runtimeConfig,
		});

		function createRuntime(
			params: PartitionRuntimeFactoryInput,
		): ConstructedPartitionRuntime {
			const { runtime, publication } = runtimeFactory(params);
			return { runtime: resources.registerRuntime(runtime), publication };
		}

		const partitions = createWorkerPartitions({
			ctx: {
				consumer: resources.kafka.consumer(
					createWorkerConsumerConfig({
						groupId: env.BALANCE_WORKER_GROUP_ID,
						timings: runtimeConfig.timings,
					}),
				),
				partitionOffsets: resources.kafka.admin(),
				stateStore: resources.stateStore,
				createRuntime,
				onError: dependencies.onError,
				onUnhealthyPartition: dependencies.onError,
			},
			config: {
				topic: env.BALANCE_WORKER_METERING_TOPIC,
				partitionsConsumedConcurrently: env.BALANCE_WORKER_PARTITION_COUNT,
				healthRefreshIntervalMs: runtimeConfig.timings.healthRefreshIntervalMs,
			},
		});
		const app = createBalanceWorkerApp({
			ctx: {
				ownership: partitions,
				partitionResolver: resources.partitionResolver,
				logger: dependencies.logger,
			},
		});

		function listen(): WorkerListener {
			const listener = Bun.serve({
				hostname: address.hostname,
				port: env.BALANCE_WORKER_PORT,
				maxRequestBodySize: env.BALANCE_WORKER_MAX_REQUEST_BYTES,
				fetch: app.fetch,
				idleTimeout: 0,
			});
			dependencies.logger.info(
				`Balance worker listening at ${address.endpoint}; partition admission follows recovery`,
			);
			return listener;
		}

		const ctx: WorkerLifecycleContext = {
			partitions,
			listen,
			settleResources: resources.settleResources,
			closeStore: resources.closeStore,
		};
		const state: BalanceWorkerState = { status: "created" };
		function start(): Promise<void> {
			return startWorker({ ctx, state });
		}
		function stop(): Promise<void> {
			return stopWorker({ ctx, state });
		}
		return { start, stop };
	} catch (cause) {
		resources.closeStore();
		await resources.admin.disconnect();
		throw cause;
	}
}

async function latest(): Promise<PartitionCheckpointV1 | null> {
	return null;
}
