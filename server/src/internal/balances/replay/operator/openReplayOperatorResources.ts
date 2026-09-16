import type { ReplayManifest } from "../manifest/replayManifestContracts.js";
import type { ValidatedReplayStagingTarget } from "../targets/replayStagingTargetContracts.js";
import {
	closeReplayOperatorResources,
	type ReplayOperatorClosePorts,
} from "./closeReplayOperatorResources.js";
import { describeReplayOperatorError } from "./replayOperatorErrors.js";
import type { ReplayArchiveReport } from "./runReplayArchive.js";
import {
	REPLAY_OPERATOR_CUSTOMER_LANES,
	type ReplayOperatorResourceFactory,
	type ReplayOperatorResources,
	type ReplayOperatorRunInput,
} from "./runReplayOperator.js";

const REPLAY_OPERATOR_CLIENT_ID = "autumn-shadow-operator";
const REPLAY_OWNERSHIP_GROUP_PREFIX = "autumn-shadow-operator";
const REPLAY_WORKER_REQUEST_TIMEOUT_MS = 5_000;
const REPLAY_DATABASE_MAX_CONNECTIONS = 4;
/** initDrizzle takes seconds and overrides poolConfig.connectionTimeoutMillis. */
const REPLAY_DATABASE_CONNECT_TIMEOUT_SECONDS = 2;
const REPLAY_DATABASE_QUERY_TIMEOUT_MS = 2_000;
const REPLAY_DATABASE_READ_ONLY_OPTIONS = "-c default_transaction_read_only=on";
const REPLAY_KAFKA_LIMITS = {
	connectionTimeoutMs: 10_000,
	requestTimeoutMs: 30_000,
	retryCount: 3,
	initialRetryTimeMs: 300,
	maxRetryTimeMs: 5_000,
};

/** Loaded only here: every one of these modules builds pools, clients or
 *  loggers at import time, and a dry run must construct none of them. */
async function loadReplayOperatorModules() {
	const [
		kafkajs,
		kafka,
		workerClient,
		database,
		logtail,
		postgresSource,
		hydration,
		archive,
	] = await Promise.all([
		import("kafkajs"),
		import("@autumn/kafka"),
		import("@autumn/balance-worker-client"),
		import("@/db/initDrizzle.js"),
		import("@/external/logtail/logtailUtils.js"),
		import("../postgres/createPostgresReplayHydrationSource.js"),
		import("../../hydration/createBalanceHydrationCoordinator.js"),
		import("./runReplayArchive.js"),
	]);
	return {
		Kafka: kafkajs.Kafka,
		createKafkaClient: kafka.createKafkaClient,
		createKafkaTransport: kafka.createKafkaTransport,
		createOwnershipConsumer: kafka.createOwnershipConsumer,
		createBalanceWorkerClient: workerClient.createBalanceWorkerClient,
		initDrizzle: database.initDrizzle,
		logger: logtail.logger,
		createPostgresReplayHydrationSource:
			postgresSource.createPostgresReplayHydrationSource,
		createBalanceHydrationCoordinator:
			hydration.createBalanceHydrationCoordinator,
		runReplayArchive: archive.runReplayArchive,
	};
}

type ReplayOperatorModules = Awaited<
	ReturnType<typeof loadReplayOperatorModules>
>;

function createReplayOwnershipConsumer({
	modules,
	target,
}: {
	modules: ReplayOperatorModules;
	target: ValidatedReplayStagingTarget;
}) {
	const kafkaConfig = modules.createKafkaClient({
		clientId: `${REPLAY_OPERATOR_CLIENT_ID}-${crypto.randomUUID()}`,
		brokers: [...target.brokers],
		transport: modules.createKafkaTransport({
			authMode: "msk_iam",
			region: target.region,
		}),
		limits: REPLAY_KAFKA_LIMITS,
	});
	return modules.createOwnershipConsumer({
		ctx: { kafka: new modules.Kafka(kafkaConfig) },
		config: {
			topic: target.topic,
			groupIdPrefix: REPLAY_OWNERSHIP_GROUP_PREFIX,
		},
	});
}

function createReplayDatabase({
	modules,
	databaseUrl,
}: {
	modules: ReplayOperatorModules;
	databaseUrl: string;
}) {
	return modules.initDrizzle({
		databaseUrl,
		maxConnections: REPLAY_DATABASE_MAX_CONNECTIONS,
		connectTimeout: REPLAY_DATABASE_CONNECT_TIMEOUT_SECONDS,
		poolConfig: {
			options: REPLAY_DATABASE_READ_ONLY_OPTIONS,
			query_timeout: REPLAY_DATABASE_QUERY_TIMEOUT_MS,
		},
	});
}

/** The rebased run end minus the frozen baseline is exactly the logical window
 *  the source is allowed to hydrate. */
function resolveReplayWindowMs({
	manifest,
}: {
	manifest: ReplayManifest;
}): number {
	return manifest.logicalRunEndMs - manifest.baseline.capturedAtMs;
}

function resolveRunSignal({ signal }: { signal?: AbortSignal }): AbortSignal {
	return signal ?? new AbortController().signal;
}

function reportStartupCleanupFailure({ error }: { error: unknown }): void {
	console.error(
		JSON.stringify({
			event: "replay_operator_startup_cleanup_failed",
			error: describeReplayOperatorError({ error }),
		}),
	);
}

async function closeAfterFailedStartup({
	ports,
}: {
	ports: ReplayOperatorClosePorts;
}): Promise<void> {
	try {
		await closeReplayOperatorResources({ ports });
	} catch (error) {
		reportStartupCleanupFailure({ error });
	}
}

function buildReplayOperatorResources({
	modules,
	coordinator,
	readContext,
	ports,
}: {
	modules: ReplayOperatorModules;
	coordinator: Parameters<
		ReplayOperatorModules["runReplayArchive"]
	>[0]["coordinator"];
	readContext: Parameters<
		ReplayOperatorModules["runReplayArchive"]
	>[0]["readContext"];
	ports: ReplayOperatorClosePorts;
}): ReplayOperatorResources<ReplayArchiveReport> {
	function run({
		manifest,
		requestsPerSecond,
		signal,
	}: ReplayOperatorRunInput): Promise<ReplayArchiveReport> {
		return modules.runReplayArchive({
			manifest,
			coordinator,
			readContext,
			config: {
				concurrency: REPLAY_OPERATOR_CUSTOMER_LANES,
				requestsPerSecond,
			},
			signal: resolveRunSignal({ signal }),
		});
	}
	function close(): Promise<void> {
		return closeReplayOperatorResources({ ports });
	}
	return { run, close };
}

/**
 * Composes the physical replay resources after the operator has already proven
 * the manifest, the limits and the pinned staging target. Ownership is started
 * before anything prewarms, and a startup that fails or is cancelled closes
 * whatever it already created before rethrowing.
 */
export async function openReplayOperatorResources({
	manifest,
	target,
	databaseUrl,
	signal,
}: {
	manifest: ReplayManifest;
	target: ValidatedReplayStagingTarget;
	databaseUrl: string;
	signal?: AbortSignal;
}): Promise<ReplayOperatorResources<ReplayArchiveReport>> {
	signal?.throwIfAborted();
	const modules = await loadReplayOperatorModules();
	const ports: ReplayOperatorClosePorts = {};
	try {
		const owners = createReplayOwnershipConsumer({ modules, target });
		ports.stopOwners = () => owners.stop();
		await owners.start();
		signal?.throwIfAborted();

		const database = createReplayDatabase({ modules, databaseUrl });
		ports.endPool = () => database.client.end();

		const source = modules.createPostgresReplayHydrationSource({
			db: database.db,
			logger: modules.logger,
			replayWindowMs: resolveReplayWindowMs({ manifest }),
		});
		ports.closeSource = () => source.close();

		const client = modules.createBalanceWorkerClient({
			ctx: { owners },
			config: {
				partitionCount: target.partitionCount,
				timeoutMs: REPLAY_WORKER_REQUEST_TIMEOUT_MS,
			},
		});
		const coordinator = modules.createBalanceHydrationCoordinator({
			source,
			client,
		});
		ports.closeCoordinator = () => coordinator.close();
		signal?.throwIfAborted();

		return buildReplayOperatorResources({
			modules,
			coordinator,
			readContext: source.readContext,
			ports,
		});
	} catch (cause) {
		await closeAfterFailedStartup({ ports });
		throw cause;
	}
}

export function createReplayOperatorResourceFactory({
	databaseUrl,
}: {
	databaseUrl: string;
}): ReplayOperatorResourceFactory<ReplayArchiveReport> {
	return (input) => openReplayOperatorResources({ ...input, databaseUrl });
}
