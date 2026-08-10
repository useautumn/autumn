// Sentry + OpenTelemetry must be imported before any application code
await import("./sentry.js");

import cluster from "node:cluster";
import http from "node:http";
import os from "node:os";
import { getRequestListener } from "@hono/node-server";
import { client, clientCritical, clientReplica, db } from "./db/initDrizzle.js";
import {
	initPgHealthMonitor,
	shutdownPgHealthMonitor,
} from "./db/pgHealthMonitor.js";
import { startPgPoolMonitor, stopPgPoolMonitor } from "./db/pgPoolMonitor.js";
import { getRedactedDatabaseUrls } from "./db/redactDatabaseUrl.js";
import {
	startReplicaRoutingProber,
	stopReplicaRoutingProber,
} from "./db/replicaRoutingState.js";
import { logger } from "./external/logtail/logtailUtils.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "./internal/misc/edgeConfig/edgeConfigRegistry.js";

// Edge config modules self-register on import
import "./internal/misc/requestBlocks/requestBlockStore.js";
import "./internal/misc/rollouts/rolloutConfigStore.js";
import "./internal/misc/featureFlags/featureFlagStore.js";
import "./internal/misc/customerBlocks/customerBlockStore.js";
import "./internal/misc/edgeConfig/orgLimitsStore.js";
import "./internal/misc/stripeSync/stripeSyncStore.js";
import "./internal/misc/redisV2Cache/redisV2CacheStore.js";
import "./internal/misc/miscRedisConfig/miscRedisConfigStore.js";
import "./internal/misc/cacheV2Ramp/cacheV2RampStore.js";
import "./internal/misc/jobQueues/jobQueueStore.js";
import "./internal/misc/batchReset/batchResetConfigStore.js";
import "./internal/misc/resetJob/resetJobStore.js";
import "./internal/misc/resetJobV2/resetJobV2Store.js";
import "./internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import "./internal/misc/asyncTrack/asyncTrackStore.js";

// Side-effect: configures trigger.dev SDK to use TRIGGER_SERVER_SECRET_KEY.
import "./trigger/configureTrigger.js";
import { closeStripeSyncEngine } from "@autumn/stripe-sync";
import { primeRedisMonitor } from "./external/redis/availabilityMonitor/redisAvailability.js";
import {
	primeRedisV2Monitor,
	startRedisV2Monitor,
	stopRedisV2Monitor,
} from "./external/redis/availabilityMonitor/redisV2Availability.js";
import {
	startRedisMonitor,
	stopRedisMonitor,
	warmupRegionalRedis,
} from "./external/redis/initRedis.js";
import { preWarmOrgRedisConnections } from "./external/redis/orgRedisPool.js";
import { createHonoApp } from "./initHono.js";
import { otelSdk } from "./instrumentation.js";
import { shutdownSqsSendBatchers } from "./queue/queueUtils.js";
import { checkEnvVars } from "./utils/initUtils.js";
import {
	attachPrimaryForkRecycling,
	startWorkerForkRecycling,
} from "./utils/memory/forkRecycling/attachForkRecycling.js";
import { listInFlightRequests } from "./utils/memory/inFlightRequests.js";
import {
	startMemorySpikeProbe,
	stopMemorySpikeProbe,
} from "./utils/memory/memorySpikeProbe.js";
import { startMemoryMonitor } from "./utils/memoryMonitor.js";

checkEnvVars();

let shuttingDown = false;
// Set once the worker's HTTP server exists; SIGTERM shutdown uses it to stop
// accepting before any teardown, mirroring the fork-recycle drain shape.
let stopAcceptingRequests: (() => void) | null = null;
const drainState: {
	draining: boolean;
	getActiveConnectionCount: () => number;
} = { draining: false, getActiveConnectionCount: () => 0 };

const init = async ({
	startupStartedAt,
}: {
	startupStartedAt: number;
}): Promise<http.Server> => {
	logger.info(getRedactedDatabaseUrls(), "DB URLs");

	const app = createHonoApp();

	initPgHealthMonitor({ client: clientCritical });
	startPgPoolMonitor();
	// `db` is the general pool — the probe must never occupy a critical-pool slot.
	startReplicaRoutingProber({ db });

	void warmupRegionalRedis().catch((error) => {
		logger.warn("[Redis] Warmup failed", { error });
	});
	void preWarmOrgRedisConnections({ db }).catch((error) => {
		logger.warn("[OrgRedis] Warmup failed", { error });
	});

	await startAllEdgeConfigPolling({ logger });
	await Promise.all([primeRedisMonitor(), primeRedisV2Monitor()]);
	startRedisMonitor();
	startRedisV2Monitor();

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	const requestListener = getRequestListener(app.fetch);
	const server = http.createServer((req, res) => {
		// While draining for a fork recycle, tell pooled clients to retire the
		// socket after this response instead of racing the idle eviction.
		if (drainState.draining) res.setHeader("connection", "close");
		requestListener(req, res);
	});

	// Streamed responses outlive the request middleware (the body keeps writing
	// after the handler returns), so drain-extension counts sockets: during a
	// drain the idle sweeps evict keep-alives, leaving only genuinely active
	// connections — streams included.
	const openSockets = new Set<import("node:net").Socket>();
	server.on("connection", (socket) => {
		openSockets.add(socket);
		socket.on("close", () => openSockets.delete(socket));
	});
	drainState.getActiveConnectionCount = () => openSockets.size;

	server.keepAliveTimeout = 120000;
	server.headersTimeout = 120000;

	stopAcceptingRequests = () => {
		drainState.draining = true;
		server.close(() => {});
		const idleSweep = setInterval(() => server.closeIdleConnections?.(), 1_000);
		idleSweep.unref?.();
	};

	await new Promise<void>((resolve) => {
		server.listen(PORT, "0.0.0.0", () => {
			const startupDurationMs = Date.now() - startupStartedAt;
			console.log(
				`Server running on port ${PORT} (${startupDurationMs}ms startup)`,
			);
			startMemoryMonitor("server", 60_000);
			startMemorySpikeProbe({ label: "server" });
			resolve();
		});
	});

	return server;
};

if (process.env.NODE_ENV === "development") {
	registerFatalErrorHandlers();
	await init({ startupStartedAt: Date.now() });
	registerShutdownHandlers();
} else {
	const numCPUs = os.cpus().length;

	if (cluster.isPrimary) {
		console.log(`Master ${process.pid} is running`);
		console.log("Number of CPUs", numCPUs);

		const numWorkers = 3;

		for (let i = 0; i < numWorkers; i++) {
			cluster.fork();
		}

		const forkRecycling = attachPrimaryForkRecycling({
			clusterModule: cluster,
			shouldRespawn: () => !shuttingDown,
			logger,
		});

		cluster.on("exit", (worker, code, signal) => {
			// True = a coordinated recycle finished; the replacement is already
			// serving and the coordinator respawns crashes itself.
			if (forkRecycling.handleExit(worker)) return;
			// Intentional exits during shutdown are not crashes — but a genuine
			// crash in the shutdown window still deserves its log line.
			if (shuttingDown && (signal === "SIGTERM" || code === 0)) return;
			logger.error("WORKER DIED", {
				pid: worker.process.pid,
				code,
				signal,
				exitedAfterDisconnect: worker.exitedAfterDisconnect,
			});
		});

		registerShutdownHandlers();
	} else {
		registerFatalErrorHandlers();
		const server = await init({ startupStartedAt: Date.now() });
		startWorkerForkRecycling({
			server,
			getActiveRequestCount: () =>
				Math.max(
					listInFlightRequests({ now: Date.now() }).length,
					drainState.getActiveConnectionCount(),
				),
			onDrainStart: () => {
				drainState.draining = true;
			},
			exitGracefully: () => {
				// Backstop: a hung flush must not strand a drained fork. Sized above
				// the in-flight settle window inside gracefulShutdown.
				const forceExit = setTimeout(() => process.exit(0), 15_000);
				forceExit.unref?.();
				void gracefulShutdown();
			},
			logger,
		});
		registerShutdownHandlers();
	}
}

function registerFatalErrorHandlers() {
	const exitAfterLog = () => setTimeout(() => process.exit(1), 100);
	const logFatal = (event: string, error: unknown) => {
		logger.error(event, {
			error:
				error instanceof Error
					? { name: error.name, message: error.message, stack: error.stack }
					: error,
		});
	};

	process.on("uncaughtException", (error) => {
		logFatal("WORKER FATAL uncaughtException", error);
		exitAfterLog();
	});
	process.on("unhandledRejection", (reason) => {
		logFatal("WORKER FATAL unhandledRejection", reason);
		exitAfterLog();
	});
}

function registerShutdownHandlers() {
	process.on("SIGTERM", gracefulShutdown);
	process.on("SIGINT", gracefulShutdown);
	// Do NOT use process.on("exit", ...) for async cleanup!
}

async function waitForInFlightRequestsToSettle({
	timeoutMs,
}: {
	timeoutMs: number;
}) {
	const deadline = Date.now() + timeoutMs;
	while (listInFlightRequests({ now: Date.now() }).length > 0) {
		if (Date.now() > deadline) {
			console.warn(
				`[Shutdown] proceeding with ${listInFlightRequests({ now: Date.now() }).length} request(s) still in flight after ${timeoutMs}ms`,
			);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
}

async function gracefulShutdown() {
	shuttingDown = true;
	console.log("Shutting down worker, flushing telemetry and closing DB...");
	try {
		// Stop taking new requests first (SIGTERM path: ALB keeps routing
		// through deregistration), then let in-flight work finish. Requests and
		// their delayed timers enqueue SQS work, so the batchers close LAST.
		stopAcceptingRequests?.();
		await waitForInFlightRequestsToSettle({ timeoutMs: 10_000 });

		// Flush any buffered OTel spans before shutting down
		if (otelSdk) {
			await otelSdk.shutdown();
		}
		shutdownPgHealthMonitor();
		stopPgPoolMonitor();
		stopReplicaRoutingProber();
		stopRedisMonitor();
		stopRedisV2Monitor();
		stopMemorySpikeProbe();
		stopAllEdgeConfigPolling();
		// Request-scheduled timers may have enqueued during teardown: deliver
		// those, then close the batchers at the last possible moment.
		await shutdownSqsSendBatchers();
		await Promise.all([
			client.end(),
			clientCritical.end(),
			clientReplica?.end(),
			closeStripeSyncEngine(),
		]);
		console.log("Shutdown complete. Exiting process.");
		process.exit(0);
	} catch (err) {
		console.error("Error during graceful shutdown:", err);
		process.exit(1);
	}
}
