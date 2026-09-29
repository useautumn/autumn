import type { KafkaOffsetCommit } from "@autumn/kafka";
import { createSlotGate } from "../blueGreen/createSlotGate.js";
import { createSlotHeartbeat } from "../blueGreen/createSlotHeartbeat.js";
import { fleetIdOf } from "../blueGreen/fleetIdOf.js";
import { resolveTaskIdentity } from "../blueGreen/resolveTaskIdentity.js";
import { createBalanceWorkerApp } from "../http/createBalanceWorkerApp.js";
import { createOwnershipHandoffLink } from "../kafka/createOwnershipHandoffLink.js";
import { createWorkerHealthReporter } from "../logging/createWorkerHealthReporter.js";
import { createEventLoopStallMonitor } from "../logging/eventLoopStalls/createEventLoopStallMonitor.js";
import { syncSections } from "../logging/eventLoopStalls/syncSections.js";
import {
	createKafkaRequestReporter,
	kafkaRequestTimings,
} from "../logging/kafkaRequestTimings.js";
import { createPartitionLoad } from "../processor/writer/partitionLoad/createPartitionLoad.js";
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
import { createWorkerCheckpointConfig } from "./workerCheckpointConfig.js";
import {
	balanceWorkerEnvToRuntimeConfig,
	createWorkerConsumerConfig,
	workerConsumerGroupIdOf,
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
	const checkpointConfig = createWorkerCheckpointConfig({ env });
	const address = await resolveWorkerAddress({ env });
	const identity = await resolveTaskIdentity({
		ctx: { logger: dependencies.logger },
		env,
	});
	// Both Flightcontrol fleets boot with the same env; the service ARN is what tells their groups apart.
	const fleetId = identity.serviceArn
		? fleetIdOf({ serviceArn: identity.serviceArn })
		: null;
	const groupId = workerConsumerGroupIdOf({ env, fleetId });
	const runtimeConfig = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: address.endpoint,
		groupId,
	});
	const resources = await openWorkerResources({
		ctx: { logger: dependencies.logger },
		config,
		checkpointConfig,
		bootstrap: {
			restoreLimits: runtimeConfig.checkpointRestoreLimits,
			retryPolicy: runtimeConfig.checkpointRetryPolicy,
			checkpointSource: dependencies.checkpointSource,
		},
	});
	try {
		// A prepared partition announces `ready` only once the slot record names this fleet; off ECS it never waits.
		const slotGate = resources.edgeConfigs
			? createSlotGate({
					ctx: {
						identity,
						activeSlot: resources.edgeConfigs.activeSlot,
						logger: dependencies.logger,
					},
				})
			: undefined;
		if (fleetId)
			dependencies.logger.info(
				`Blue-green fleet ${fleetId}: service ${identity.serviceArn}, group ${groupId}, build ${identity.imageSha ?? "unknown"}`,
			);
		// Every partition runtime records what it commits here; the consumer group reports it when it rejoins.
		const partitionLoad = createPartitionLoad({ now: Date.now });
		const consumer = resources.kafka.consumer(
			createWorkerConsumerConfig({
				groupId,
				timings: runtimeConfig.timings,
				partitionLoad,
			}),
		);
		// With idempotent commits no transaction carries a command's offset, so the group commits it itself.
		async function commitCommandOffsets(
			offsets: KafkaOffsetCommit,
		): Promise<void> {
			const flat: { topic: string; partition: number; offset: string }[] = [];
			for (const { topic, partitions } of offsets.topics) {
				for (const { partition, offset } of partitions)
					flat.push({ topic, partition, offset });
			}
			await consumer.commitOffsets(flat);
		}
		const ownershipHandoff = createOwnershipHandoffLink({
			ctx: { kafka: resources.kafka, logger: dependencies.logger },
			config: {
				topic: env.BALANCE_WORKER_OWNERSHIP_TOPIC,
				producerLimits: runtimeConfig.producerLimits,
			},
		});
		const runtimeFactory = createPartitionRuntimeFactory({
			ctx: {
				partitionLoad,
				logger: dependencies.logger,
				kafka: resources.kafka,
				ownershipOffsets: resources.admin,
				ownershipHandoff,
				stateStore: resources.stateStore,
				db: resources.db,
				catalogCache: resources.catalogCache,
				partitionResolver: resources.partitionResolver,
				bootstrapper: resources.bootstrapper,
				checkpointMaintenance: resources.checkpoints?.maintenance,
				commandOffsets: { commit: commitCommandOffsets },
			},
			config: runtimeConfig,
		});

		function awaitReadyAnnouncement({
			signal,
		}: {
			signal: AbortSignal;
		}): Promise<void> {
			return slotGate ? slotGate.awaitActive({ signal }) : Promise.resolve();
		}

		function createRuntime(
			params: PartitionRuntimeFactoryInput,
		): ConstructedPartitionRuntime {
			const { runtime, publication } = runtimeFactory(params);
			return { runtime: resources.registerRuntime(runtime), publication };
		}

		const partitions = createWorkerPartitions({
			ctx: {
				consumer,
				partitionOffsets: resources.kafka.admin(),
				commandTopicOffsets: resources.kafka.admin(),
				stateStore: resources.stateStore,
				idempotencyKeys: resources.idempotencyKeys,
				logger: dependencies.logger,
				createRuntime,
				served: partitionLoad,
				ownershipLink: ownershipHandoff,
				awaitReadyAnnouncement,
				onError: dependencies.onError,
				onUnhealthyPartition: dependencies.onError,
				onServiceStopped: dependencies.onServiceStopped,
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
				logger: dependencies.logger,
				requestLog: {
					successSampleRate: env.BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE,
				},
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

		const state: BalanceWorkerState = { status: "created" };
		function readWorkerStatus(): BalanceWorkerState["status"] {
			return state.status;
		}
		const healthReporter = createWorkerHealthReporter({
			ctx: {
				logger: dependencies.logger,
				readPartitions: partitions.partitions,
				readWorkerStatus,
			},
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				enabled: process.env.NODE_ENV === "production",
				endpoint: address.endpoint,
			},
		});
		const reportsHealth = process.env.NODE_ENV === "production";
		// Only a task with an ECS identity is part of a fleet the dashboard can swap.
		const slotHeartbeat =
			slotGate && resources.edgeConfigs && fleetId
				? createSlotHeartbeat({
						ctx: {
							...resources.edgeConfigs.adminBucket,
							gate: slotGate,
							readPartitions: partitions.partitions,
							isAdmitted: partitions.isAdmitted,
							readAssignmentSettled: partitions.hasAssignment,
							readStoreHealthy: readSlotStoreHealthy,
							probes: { kafka: probeKafka, postgres: probePostgres },
							logger: dependencies.logger,
						},
						config: {
							deployment: env.BALANCE_WORKER_DEPLOYMENT,
							fleetId,
							endpoint: address.endpoint,
							identity,
						},
					})
				: undefined;
		function readSlotStoreHealthy(): boolean {
			return resources.edgeConfigs?.activeSlot.getStatus().healthy ?? false;
		}
		async function probeKafka(): Promise<void> {
			await resources.admin.fetchTopicOffsets(
				env.BALANCE_WORKER_OWNERSHIP_TOPIC,
			);
		}
		async function probePostgres(): Promise<void> {
			if (!resources.postgres.client) throw new Error("No Postgres pool");
			await resources.postgres.client`select 1`;
		}
		const stallMonitor = createEventLoopStallMonitor({
			ctx: { logger: dependencies.logger, recorder: syncSections },
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
				intervalMs: 10,
				stallThresholdMs: 20,
				logStallMs: 50,
				reportEveryMs: 10_000,
			},
		});
		const kafkaRequestReporter = createKafkaRequestReporter({
			ctx: { logger: dependencies.logger, timings: kafkaRequestTimings },
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
			},
		});
		function startTelemetry(): void {
			healthReporter.start();
			void slotHeartbeat?.start();
			if (!reportsHealth) return;
			stallMonitor.start();
			kafkaRequestReporter.start();
		}
		function stopTelemetry(): void {
			kafkaRequestReporter.stop();
			stallMonitor.stop();
			slotHeartbeat?.stop();
			healthReporter.stop();
		}
		const ctx: WorkerLifecycleContext = {
			partitions,
			edgeConfigs: resources.edgeConfigs,
			// The stall monitor rides the health reporter's lifecycle: both are telemetry the worker never waits on.
			healthReporter: { start: startTelemetry, stop: stopTelemetry },
			catalogInvalidations: resources.catalogInvalidations,
			listen,
			settleResources: resources.settleResources,
			closeStore: resources.closeStore,
		};
		function start(): Promise<void> {
			return startWorker({ ctx, state });
		}
		function stop(): Promise<void> {
			return stopWorker({ ctx, state });
		}
		return { start, stop };
	} catch (cause) {
		try {
			await resources.settleResources();
			resources.closeStore();
		} catch (cleanupFailure) {
			throw new AggregateError(
				[cause, cleanupFailure],
				"Worker construction and cleanup failed",
			);
		}
		throw cause;
	}
}
