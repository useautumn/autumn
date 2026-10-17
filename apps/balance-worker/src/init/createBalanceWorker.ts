import { cpus } from "node:os";
import { logUnknownInput } from "@autumn/balance-engine";
import {
	defaultBalanceWorkerThreadsEdgeConfig,
	type EdgeConfigLocation,
} from "@autumn/edge-config";
import {
	BALANCE_WORKER_STANDBY_PREPARATION_CONCURRENCY,
	BALANCE_WORKER_STEP_DOWN_S3_TIMEOUT_MS,
	BALANCE_WORKER_SUBJECT_LOAD_CONCURRENCY,
} from "@autumn/env/balanceWorkerConstants";
import type {
	KafkaOffsetCommit,
	KafkaProducerClient,
	ProducerConfig,
} from "@autumn/kafka";
import { S3Client } from "@aws-sdk/client-s3";
import { createSlotGate } from "../blueGreen/createSlotGate.js";
import { createSlotHeartbeat } from "../blueGreen/createSlotHeartbeat.js";
import { createStandbyPreparations } from "../blueGreen/createStandbyPreparations.js";
import { fleetIdOf } from "../blueGreen/fleetIdOf.js";
import { resolveTaskIdentity } from "../blueGreen/resolveTaskIdentity.js";
import { createCjsChildrenDedupe } from "../bunWorkarounds/cjsChildren/createCjsChildrenDedupe.js";
import { createColdStart } from "../coldStart/createColdStart.js";
import { subjectLoadGate } from "../external/postgres/subjectLoadGate.js";
import { createAdminBucketObjects } from "../external/s3/createAdminBucketObjects.js";
import type { AdminBucketObjects } from "../external/s3/types/adminBucketObjects.js";
import { createPartitionSendWatches } from "../health/ownNetwork/createPartitionSendWatches.js";
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
import { readMemorySignals } from "../logging/eventLoopStalls/readMemorySignals.js";
import { syncSections } from "../logging/eventLoopStalls/syncSections.js";
import { kafkaBrokerStatistics } from "../logging/kafkaBrokerStatistics.js";
import {
	createKafkaRequestReporter,
	kafkaRequestTimings,
} from "../logging/kafkaRequestTimings.js";
import { createPartitionLoad } from "../processor/writer/partitionLoad/createPartitionLoad.js";
import { createCommitPositions } from "../runtime/commitPositions/createCommitPositions.js";
import { createPartitionRuntimeFactory } from "./construction/createPartitionRuntimeFactory.js";
import { createWorkerPartitions } from "./construction/createWorkerPartitions.js";
import { createWorkerStepDown } from "./construction/createWorkerStepDown.js";
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
	openWorkerResources,
	WORKER_KAFKA_PRODUCER_LIMITS,
} from "./workerResources.js";

/** Acks are small; the ring only needs room for a burst of them while the decide thread is busy. */
const PRODUCER_ACK_RING_BYTES = 1 << 20;

function adminBucketObjectsOf({
	edgeConfigs,
}: {
	edgeConfigs: { adminBucket: { location: EdgeConfigLocation } } | undefined;
}): AdminBucketObjects | undefined {
	if (!edgeConfigs) return undefined;
	const { bucket, region } = edgeConfigs.adminBucket.location;
	return createAdminBucketObjects({
		ctx: { client: new S3Client({ region, maxAttempts: 1 }) },
		config: { bucket, timeoutMs: BALANCE_WORKER_STEP_DOWN_S3_TIMEOUT_MS },
	});
}

export async function createBalanceWorker({
	ctx: dependencies,
	config,
}: {
	ctx: BalanceWorkerDependencies;
	config: BalanceWorkerConfig;
}): Promise<BalanceWorker> {
	const { env } = config;
	assertIdempotentCommits({ mode: env.BALANCE_WORKER_COMMIT_MODE });
	logUnknownInput({ logger: dependencies.logger });
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
		// Every partition runtime records what it commits here and which partitions it serves.
		const partitionLoad = createPartitionLoad({ now: Date.now });
		const consumer = resources.kafka.consumer(
			createWorkerConsumerConfig({ groupId, timings: runtimeConfig.timings }),
		);
		// A command that leaves no record has no transaction to carry its offset, so the group commits it itself.
		async function commitCommandOffsets(
			offsets: Pick<KafkaOffsetCommit, "topics">,
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
		const sendWatches = createPartitionSendWatches();
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
				subjectSnapshotsConfig: resources.edgeConfigs?.subjectSnapshotsConfig,
				dbControl: resources.edgeConfigs?.dbControl,
				commandOffsets: { commit: commitCommandOffsets },
				sendWatches,
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
		const stepDown = createWorkerStepDown({
			ctx: {
				sendWatches,
				partitions,
				logger: dependencies.logger,
				objects: slotGate
					? adminBucketObjectsOf({ edgeConfigs: resources.edgeConfigs })
					: undefined,
			},
			config: {
				deployment: env.BALANCE_WORKER_DEPLOYMENT,
				endpoint: address.endpoint,
				fleetId,
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

		async function listen(): Promise<WorkerListener> {
			const threads =
				resources.edgeConfigs?.balanceWorkerThreads.get() ??
				defaultBalanceWorkerThreadsEdgeConfig();
			const started = await startWorkerThreads({
				ctx: {
					fetch: app.fetch,
					logger: dependencies.logger,
					onFatal: stopForThreads,
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
						sasl: env.KAFKA_SASL,
						limits: WORKER_KAFKA_PRODUCER_LIMITS,
						sendRingBytes: threads.sendRingBytes,
						ackRingBytes: PRODUCER_ACK_RING_BYTES,
						dedupeCjsChildren: env.BALANCE_WORKER_DEDUPE_CJS_CHILDREN,
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
		const coldStart = resources.edgeConfigs?.coldStart
			? createColdStart({
					ctx: {
						requests: resources.edgeConfigs.coldStart,
						partitions,
						logger: dependencies.logger,
						onAcked: writeColdStartAck,
					},
				})
			: undefined;
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
							readWork: stepDown.readWork,
							probes: { kafka: probeKafka, postgres: probePostgres },
							readColdStart: coldStart?.readAck,
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
		function writeColdStartAck(): void {
			slotHeartbeat?.writeSoon();
		}
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
			await resources.postgres.client.query("select 1");
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
				memory: readMemorySignals({
					ctx: {
						catalogCache: resources.catalogCache,
						subjectMapBudget,
						cjsChildren,
					},
				}),
				...drainThreadSignals?.(),
			};
		}
		const cjsChildren = createCjsChildrenDedupe({
			config: { enabled: env.BALANCE_WORKER_DEDUPE_CJS_CHILDREN },
		});
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
			ctx: {
				logger: dependencies.logger,
				timings: kafkaRequestTimings,
				brokers: kafkaBrokerStatistics,
			},
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
			cjsChildren.start();
			healthReporter.start();
			void slotHeartbeat?.start();
			stepDown.start();
			if (!reportsHealth) return;
			stallMonitor.start();
			kafkaRequestReporter.start();
			databaseReporter.start();
		}
		function stopTelemetry(): void {
			databaseReporter.stop();
			kafkaRequestReporter.stop();
			stallMonitor.stop();
			stepDown.stop();
			slotHeartbeat?.stop();
			healthReporter.stop();
			cjsChildren.stop();
		}
		const ctx: WorkerLifecycleContext = {
			partitions,
			edgeConfigs: resources.edgeConfigs,
			// The stall monitor rides the health reporter's lifecycle: both are telemetry the worker never waits on.
			healthReporter: { start: startTelemetry, stop: stopTelemetry },
			catalogInvalidations: resources.catalogInvalidations,
			coldStart,
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
