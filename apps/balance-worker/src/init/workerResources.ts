import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { createCatalogCache } from "@autumn/catalog-lru";
import { createIdempotencyKeyStore } from "@autumn/dynamodb";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import {
	createKafka,
	createKafkaClient,
	createKafkaTransport,
	type KafkaTokenInfo,
	meteringIdentityToPartition,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import type { PartitionCheckpointSource } from "../checkpoint/partitionCheckpointSource.js";
import {
	createCommitter,
	DEFAULT_COMMITTER_CONFIG,
} from "../committer/createCommitter.js";
import { createCommitterStateStore } from "../committer/createCommitterStateStore.js";
import { createWorkerEdgeConfigs } from "../edgeConfig/createWorkerEdgeConfigs.js";
import { createWorkerDynamoClient } from "../external/dynamodb/createWorkerDynamoClient.js";
import {
	createCommitterDb,
	createWorkerDb,
	createWorkerPostgresClient,
} from "../external/postgres/getWorkerDb.js";
import { subjectLoadGate } from "../external/postgres/subjectLoadGate.js";
import { createCatalogInvalidationConsumer } from "../kafka/createCatalogInvalidationConsumer.js";
import { databaseTimings } from "../logging/databaseTimings.js";
import { createPartitionBootstrapper } from "../runtime/bootstrap/createPartitionBootstrapper.js";
import { createProgressBootstrapper } from "../runtime/bootstrap/createProgressBootstrapper.js";
import type {
	PartitionBootstrapper,
	PartitionBootstrapRetryPolicy,
} from "../runtime/bootstrap/types/partitionBootstrap.js";
import type { PartitionCheckpointRestoreLimits } from "../state/actions/checkpoint/restorePartitionCheckpoint.js";
import { openStateStore } from "../state/openStateStore.js";
import { STATE_BACKEND } from "../state/stateBackend.js";
import type { StateStore } from "../state/types/stateStore.js";
import { createWorkerCheckpointResources } from "./construction/createWorkerCheckpointResources.js";
import type {
	BalanceWorkerConfig,
	WorkerResources,
	WorkerResourcesContext,
	WorkerRuntimeResource,
} from "./types/balanceWorker.js";
import type { WorkerCheckpointResources } from "./types/workerCheckpointResources.js";
import type { WorkerCheckpointConfig } from "./workerCheckpointConfig.js";
import { validateBalanceWorkerTopics } from "./workerConfig.js";

export type WorkerBootstrapConfig = {
	restoreLimits: PartitionCheckpointRestoreLimits;
	retryPolicy: PartitionBootstrapRetryPolicy;
	checkpointSource?: PartitionCheckpointSource;
};

/** The client limits every worker Kafka client uses. */
export const WORKER_KAFKA_CLIENT_LIMITS = {
	connectionTimeoutMs: 5000,
	requestTimeoutMs: 30000,
	retryCount: 2,
	initialRetryTimeMs: 100,
	maxRetryTimeMs: 1000,
};

/** Every token a client presents, so a broker's refusal can be read against the key and lifetime it was shown. */
export function logWorkerKafkaToken({
	logger,
	info,
}: {
	logger?: Pick<AutumnLogger, "info">;
	info: KafkaTokenInfo;
}): void {
	logger?.info(
		{ event: "balance_worker.kafka_token", data: info },
		`Kafka token signed with key …${info.keyIdSuffix ?? "?"}; expires ${info.expiresAt}`,
	);
}

export async function openWorkerResources({
	ctx: dependencies = {},
	config,
	checkpointConfig,
	bootstrap,
}: {
	ctx?: {
		logger?: Pick<AutumnLogger, "info" | "warn" | "error">;
		/** Stands in for the admin bucket; the benchmark polls a directory through it. */
		edgeConfigS3Client?: EdgeConfigS3Client;
	};
	config: BalanceWorkerConfig;
	checkpointConfig: WorkerCheckpointConfig;
	bootstrap: WorkerBootstrapConfig;
}): Promise<WorkerResources> {
	const { env } = config;
	function logKafkaToken(info: KafkaTokenInfo): void {
		logWorkerKafkaToken({ logger: dependencies.logger, info });
	}
	const kafka = createKafka(
		createKafkaClient({
			clientId: `balance-worker-${crypto.randomUUID()}`,
			brokers: env.KAFKA_BROKERS,
			transport: createKafkaTransport({
				authMode: env.KAFKA_AUTH_MODE,
				region: env.AWS_REGION,
				sasl: env.KAFKA_SASL,
				onToken: logKafkaToken,
			}),
			limits: WORKER_KAFKA_CLIENT_LIMITS,
		}),
	);
	const admin = kafka.admin();
	function partitionForIdentity({
		identity,
	}: {
		identity: MeteringIdentity;
	}): number {
		return meteringIdentityToPartition({
			identity,
			partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
		});
	}
	const partitionResolver = { partitionForIdentity };
	let stateStore: StateStore | undefined;
	let checkpoints: WorkerCheckpointResources | undefined;
	try {
		await admin.connect();
		await validateBalanceWorkerTopics({ admin, env });
		const edgeConfigs = createWorkerEdgeConfigs({
			ctx: {
				logger: dependencies.logger,
				s3Client: dependencies.edgeConfigS3Client,
			},
			config: { location: { bucket: env.S3_BUCKET, region: env.S3_REGION } },
		});
		const postgres = createWorkerPostgresClient({
			ctx: { logger: dependencies.logger },
			env,
		});
		const db = createWorkerDb({
			ctx: {
				postgres,
				subjectLoads: subjectLoadGate,
				timings: databaseTimings,
				subjectSnapshotsConfig: edgeConfigs.subjectSnapshotsConfig,
			},
		});
		const dynamo = createWorkerDynamoClient({ env });
		const idempotencyKeys = createIdempotencyKeyStore({
			ctx: {
				dynamo,
				tableName: env.DYNAMODB_IDEMPOTENCY_TABLE,
				logger: dependencies.logger,
			},
		});
		function readCommitterControl() {
			return edgeConfigs.dbControl.get().balanceCommitter;
		}
		const catalogCache = createCatalogCache({
			ctx: {
				db,
				config: {
					mutableRowTtlMs: env.BALANCE_WORKER_CATALOG_TTL_MS,
					maxSizeBytes: env.BALANCE_WORKER_CATALOG_MAX_BYTES,
				},
			},
		});
		const catalogInvalidations = createCatalogInvalidationConsumer({
			ctx: { kafka, catalogCache, logger: dependencies.logger },
			config: {
				topic: env.BALANCE_WORKER_CATALOG_INVALIDATION_TOPIC,
				groupIdPrefix: `${env.BALANCE_WORKER_DEPLOYMENT}-worker-catalog`,
			},
		});
		let bootstrapper: PartitionBootstrapper;
		if ((config.stateBackend ?? STATE_BACKEND) === "sqlite") {
			mkdirSync(dirname(env.BALANCE_WORKER_SQLITE_PATH), { recursive: true });
			const sqliteStore = openStateStore({
				databasePath: env.BALANCE_WORKER_SQLITE_PATH,
			});
			stateStore = sqliteStore;
			checkpoints = await createWorkerCheckpointResources({
				ctx: { stateStore: sqliteStore },
				config: checkpointConfig,
			});
			bootstrapper = createPartitionBootstrapper({
				stateStore: sqliteStore,
				checkpointSource: bootstrap.checkpointSource ?? checkpoints.source,
				partitionResolver,
				restoreLimits: bootstrap.restoreLimits,
				retryPolicy: bootstrap.retryPolicy,
			});
		} else {
			const committerDb = createCommitterDb({
				ctx: { postgres, timings: databaseTimings },
			});
			const committerStore = createCommitterStateStore({
				ctx: {
					committer: createCommitter({
						ctx: {
							db: committerDb,
							logger: dependencies.logger,
							control: { read: readCommitterControl },
							subjectSnapshotsConfig: edgeConfigs.subjectSnapshotsConfig,
						},
						config: {
							...DEFAULT_COMMITTER_CONFIG,
							concurrency: env.BALANCE_WORKER_DATABASE_POOL_SIZE,
							snapshots: {
								partitionCount: env.BALANCE_WORKER_PARTITION_COUNT,
							},
						},
					}),
					db: committerDb,
					logger: dependencies.logger,
					subjectSnapshotsConfig: edgeConfigs.subjectSnapshotsConfig,
				},
			});
			stateStore = committerStore;
			bootstrapper = createProgressBootstrapper({ stateStore: committerStore });
		}
		return createWorkerResources({
			ctx: {
				kafka,
				admin,
				stateStore,
				postgres,
				db,
				dynamo,
				idempotencyKeys,
				catalogCache,
				catalogInvalidations,
				partitionResolver,
				bootstrapper,
				checkpoints,
				edgeConfigs,
			},
		});
	} catch (cause) {
		return await closeFailedWorkerResources({
			ctx: { stateStore, checkpoints, admin },
			cause,
		});
	}
}

export async function closeFailedWorkerResources({
	ctx,
	cause,
}: {
	ctx: {
		stateStore?: Pick<StateStore, "close">;
		checkpoints?: Pick<WorkerCheckpointResources, "stop">;
		admin: Pick<WorkerResourcesContext["admin"], "disconnect">;
	};
	cause: unknown;
}): Promise<never> {
	const errors: unknown[] = [cause];
	try {
		await ctx.checkpoints?.stop();
		ctx.stateStore?.close();
	} catch (cleanupFailure) {
		errors.push(cleanupFailure);
	}
	try {
		await ctx.admin.disconnect();
	} catch (disconnectFailure) {
		errors.push(disconnectFailure);
	}
	if (errors.length > 1)
		throw new AggregateError(
			errors,
			"Worker resource opening and cleanup failed",
		);
	throw cause;
}

export function createWorkerResources({
	ctx,
}: {
	ctx: WorkerResourcesContext;
}): WorkerResources {
	const runtimes = new Set<WorkerRuntimeResource>();

	function registerRuntime<Runtime extends WorkerRuntimeResource>(
		runtime: Runtime,
	): Runtime {
		runtimes.add(runtime);
		async function waitForQuiescence(): Promise<void> {
			await runtime.waitForQuiescence();
			runtimes.delete(runtime);
		}
		return { ...runtime, waitForQuiescence };
	}

	async function settleRuntime(runtime: WorkerRuntimeResource): Promise<void> {
		try {
			await runtime.stop();
		} finally {
			await runtime.waitForQuiescence();
		}
		runtimes.delete(runtime);
	}

	async function settleResources(): Promise<void> {
		const pending: Promise<void>[] = [];
		for (const runtime of [...runtimes]) pending.push(settleRuntime(runtime));
		if (ctx.checkpoints) pending.push(ctx.checkpoints.stop());
		ctx.edgeConfigs?.stop();
		ctx.dynamo.close();
		const results = await Promise.allSettled(pending);
		await ctx.admin.disconnect();
		await ctx.postgres.close();
		const errors: unknown[] = [];
		for (const result of results) {
			if (result.status === "rejected") errors.push(result.reason);
		}
		if (errors.length > 0)
			throw new AggregateError(
				errors,
				"Worker resources did not settle safely",
			);
	}

	function closeStore(): void {
		ctx.stateStore.close();
	}

	return { ...ctx, registerRuntime, settleResources, closeStore };
}
