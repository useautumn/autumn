import { cpus } from "node:os";
import { defaultBalanceWorkerThreadsEdgeConfig } from "@autumn/edge-config";
import {
	BALANCE_WORKER_STANDBY_PREPARATION_CONCURRENCY,
	BALANCE_WORKER_SUBJECT_LOAD_CONCURRENCY,
} from "@autumn/env/balanceWorkerConstants";
import type {
	KafkaOffsetCommit,
	KafkaProducerClient,
	KafkaTokenInfo,
} from "@autumn/kafka";
import type { ProducerConfig } from "kafkajs";
import { createSlotGate } from "../blueGreen/createSlotGate.js";
import { createSlotHeartbeat } from "../blueGreen/createSlotHeartbeat.js";
import { createStandbyPreparations } from "../blueGreen/createStandbyPreparations.js";
import { fleetIdOf } from "../blueGreen/fleetIdOf.js";
import { resolveTaskIdentity } from "../blueGreen/resolveTaskIdentity.js";
import { subjectLoadGate } from "../external/postgres/subjectLoadGate.js";
import { createBalanceWorkerApp } from "../http/createBalanceWorkerApp.js";
import {
	createInlineHandler,
	INLINE_ROUTES,
} from "../http/handlers/inline/createInlineHandler.js";
import { heldFailureOf } from "../http/handlers/inline/heldFailureOf.js";
import { createInlineCounters } from "../http/handlers/inline/inlineCounters.js";
import { createOwnershipHandoffLink } from "../kafka/createOwnershipHandoffLink.js";
import type { ThreadedProducers } from "../kafka/producerThread/createThreadedProducers.js";
import {
	commitSummaries,
	logCommitWindows,
} from "../logging/commitSummaries.js";
import { createWorkerHealthReporter } from "../logging/createWorkerHealthReporter.js";
import {
	createDatabaseReporter,
	databaseTimings,
} from "../logging/databaseTimings.js";
import { createEventLoopStallMonitor } from "../logging/eventLoopStalls/createEventLoopStallMonitor.js";
import { syncSections } from "../logging/eventLoopStalls/syncSections.js";
import {
	createKafkaRequestReporter,
	kafkaRequestTimings,
} from "../logging/kafkaRequestTimings.js";
import { createPartitionLoad } from "../processor/writer/partitionLoad/createPartitionLoad.js";
import { createCommitPositions } from "../runtime/commitPositions/createCommitPositions.js";
import { createPartitionRuntimeFactory } from "./construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "./construction/createWorkerPartitions.js";
import { startWorkerThreads } from "./construction/startWorkerThreads.js";
import { startWorker } from "./lifecycle/startWorker.js";
import { stopWorker } from "./lifecycle/stopWorker.js";
import { resolveWorkerAddress } from "./resolveWorkerAddress.js";
import { assertIdempotentCommits } from "./rules/assertIdempotentCommits.js";
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
import {
	logWorkerKafkaToken,
	openWorkerResources,
	WORKER_KAFKA_CLIENT_LIMITS,
} from "./workerResources.js";

/** Acks are small; the ring only needs room for a burst of them while the decide thread is busy. */
const PRODUCER_ACK_RING_BYTES = 1 << 20;

export async function createBalanceWorker({
	ctx: dependencies,
	config,
}: {
	ctx: BalanceWorkerDependencies;
	config: BalanceWorkerConfig;
}): Promise<BalanceWorker> {
	const { env } = config;
	assertIdempotentCommits({ mode: env.BALANCE_WORKER_COMMIT_MODE });
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
	dependencies.onIdentityResolved?.({ ...identity, fleetId });
	const groupId = workerConsumerGroupIdOf({ env, fleetId });
	const runtimeConfig = balanceWorkerEnvToRuntimeConfig({
		env,
		endpoint: address.endpoint,
		groupId,
	});
	const subjectMapBudget = runtimeConfig.writerLimits.subjectMapBudget;
	if (subjectMapBudget)
		dependencies.logger.info(
			`Subject map budget: ${Math.round(subjectMapBudget.totalBytes / 1_048_576)} MiB for this worker, shared by the partitions it holds`,
		);
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
		// A command that leaves no record has no transaction to carry its offset, so the group commits it itself.
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
		// The producer thread starts with the listener, before any partition runtime asks for a producer.
		let producers: ThreadedProducers | null = null;
		let drainThreadSignals:
			| (() => {
					threads: Record<string, number>;
					latencyMs: Record<string, unknown>;
			  })
			| null = null;
		function partitionProducer(
			producerConfig: ProducerConfig,
		): KafkaProducerClient {
			if (!producers)
				throw new Error(
					"Partition producers live on the producer thread, which starts with the listener",
				);
			return producers.producer(producerConfig);
		}
		const commitPositions = createCommitPositions({
			config: { partitionCount: env.BALANCE_WORKER_PARTITION_COUNT },
		});
		const runtimeFactory = createPartitionRuntimeFactory({
			ctx: {
				partitionLoad,
				logger: dependencies.logger,
				kafka: { producer: partitionProducer },
				commitPositions,
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

		const standbyPreparations = slotGate
			? createStandbyPreparations({
					ctx: { gate: slotGate },
					config: {
						concurrency: BALANCE_WORKER_STANDBY_PREPARATION_CONCURRENCY,
					},
				})
			: undefined;

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
				acquirePreparation: standbyPreparations?.acquire,
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

		const inlineCounters = createInlineCounters();
		const inlineHandler = createInlineHandler({
			ctx: {
				counters: inlineCounters,
				ownership: partitions,
				partitionResolver: resources.partitionResolver,
				logger: dependencies.logger,
				requestLog: {
					successSampleRate: env.BALANCE_WORKER_REQUEST_LOG_SAMPLE_RATE,
				},
			},
		});

		/** A thread that died leaves the worker unable to serve or commit; the task is replaced. */
		function stopForThreads({
			cause,
			scope,
		}: {
			cause: unknown;
			scope: "http-workers" | "producer-thread";
		}): void {
			dependencies.onServiceStopped?.({ cause, scope });
		}

		function logProducerThreadToken(info: KafkaTokenInfo): void {
			logWorkerKafkaToken({ logger: dependencies.logger, info });
		}

		async function listen(): Promise<WorkerListener> {
			const threads =
				resources.edgeConfigs?.balanceWorkerThreads.get() ??
				defaultBalanceWorkerThreadsEdgeConfig();
			const started = await startWorkerThreads({
				ctx: {
					fetch: app.fetch,
					logger: dependencies.logger,
					onFatal: stopForThreads,
					onToken: logProducerThreadToken,
					heldReplies: {
						positions: commitPositions,
						renderFailure: heldFailureOf,
					},
				},
				config: {
					http: {
						hostname: address.hostname,
						port: env.BALANCE_WORKER_PORT,
						maxRequestBodySize: env.BALANCE_WORKER_MAX_REQUEST_BYTES,
						threads: threads.httpWorkers,
						requestRingBytes: threads.requestRingBytes,
						replyRingBytes: threads.replyRingBytes,
						inline: {
							routes: INLINE_ROUTES,
							handler: inlineHandler,
							commitCells: commitPositions.cells,
							failureCounts: commitPositions.failureCounts,
						},
					},
					producers: {
						clientId: `balance-worker-producers-${crypto.randomUUID()}`,
						brokers: env.KAFKA_BROKERS,
						authMode: env.KAFKA_AUTH_MODE,
						region: env.AWS_REGION,
						sasl: env.KAFKA_SASL,
						limits: WORKER_KAFKA_CLIENT_LIMITS,
						sendRingBytes: threads.sendRingBytes,
						ackRingBytes: PRODUCER_ACK_RING_BYTES,
					},
				},
			});
			producers = started.producers;
			drainThreadSignals = started.drainThreadSignals;
			dependencies.logger.info(
				`Balance worker listening at ${address.endpoint} through ${threads.httpWorkers} HTTP worker threads, partition producers on the producer thread; partition admission follows recovery`,
			);
			return started.listener;
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
				readConsumer: partitions.consumer,
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
		/** Closes the window: its per-partition commit lines go out, and its signals join the summary line. */
		function windowSignals() {
			logCommitWindows({
				ctx: { logger: dependencies.logger, summaries: commitSummaries },
				config: {
					deployment: env.BALANCE_WORKER_DEPLOYMENT,
					endpoint: address.endpoint,
				},
			});
			return {
				inline: inlineCounters.drain(),
				...drainThreadSignals?.(),
			};
		}
		const stallMonitor = createEventLoopStallMonitor({
			ctx: {
				logger: dependencies.logger,
				recorder: syncSections,
				signals: windowSignals,
			},
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
				intervalMs: 10,
				stallThresholdMs: 20,
				logStallMs: 50,
				reportEveryMs: 10_000,
				cpuModel: cpus()[0]?.model,
			},
		});
		const kafkaRequestReporter = createKafkaRequestReporter({
			ctx: { logger: dependencies.logger, timings: kafkaRequestTimings },
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
			},
		});
		const databaseReporter = createDatabaseReporter({
			ctx: {
				logger: dependencies.logger,
				timings: databaseTimings,
				gate: subjectLoadGate,
			},
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
				poolSize: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
				subjectLoadConcurrency: BALANCE_WORKER_SUBJECT_LOAD_CONCURRENCY,
			},
		});
		function startTelemetry(): void {
			healthReporter.start();
			void slotHeartbeat?.start();
			if (!reportsHealth) return;
			stallMonitor.start();
			kafkaRequestReporter.start();
			databaseReporter.start();
		}
		function stopTelemetry(): void {
			databaseReporter.stop();
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
