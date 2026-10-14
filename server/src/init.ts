// Sentry + OpenTelemetry must be imported before any application code
await import("./sentry.js");

import cluster from "node:cluster";
import http from "node:http";
import os from "node:os";
import { logUnknownInput } from "@autumn/balance-engine";
import { getRequestListener } from "@hono/node-server";
import { flushTelemetry } from "@/utils/logging/initLogger.js";
import {
	client,
	clientCritical,
	clientReplica,
	clientReplicaSlow,
	db,
} from "./db/initDrizzle.js";
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
import {
	startBalanceShadow,
	stopBalanceShadow,
} from "./external/balanceWorker/balanceShadow.js";
import {
	startBalanceWorkerClient,
	stopBalanceWorkerClient,
} from "./external/balanceWorker/getBalanceWorkerClient.js";
import { logger } from "./external/logtail/logtailUtils.js";
import {
	startAllEdgeConfigPolling,
	stopAllEdgeConfigPolling,
} from "./internal/misc/edgeConfig/edgeConfigRegistry.js";

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
import "./internal/misc/resetJobV2/resetJobV2Store.js";
import "./internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import "./internal/misc/asyncTrack/asyncTrackStore.js";
import "./internal/misc/rateLimiter/public/agentProvisionRateLimit/agentProvisionRateLimitStore.js";

import "./trigger/configureTrigger.js";
import { closeStripeSyncEngine } from "@autumn/stripe-sync";
import { prewarmMotherDuckResolver } from "./external/motherduck/initMotherDuck.js";
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
import { awaitBoundedWarmup } from "./external/redis/initUtils/boundedWarmup.js";
import { preWarmOrgRedisConnections } from "./external/redis/orgRedisPool.js";
import { createHonoApp } from "./initHono.js";
import { otelSdk } from "./instrumentation.js";
import { globalEventBatchingManager } from "./internal/balances/events/EventBatchingManager.js";
import { globalSyncBatchingManagerV3 } from "./internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { getSqsJobs } from "./queue/getSqsJobs.js";
import { shutdownSqsSendBatchers } from "./queue/queueUtils.js";
import { checkEnvVars } from "./utils/initUtils.js";
import {
	attachPrimaryForkRecycling,
	startWorkerForkRecycling,
} from "./utils/memory/forkRecycling/attachForkRecycling.js";
import { getServerForkCount } from "./utils/memory/forkRecycling/recyclePolicy.js";
import { listInFlightRequests } from "./utils/memory/inFlightRequests.js";
import {
	startMemorySpikeProbe,
	stopMemorySpikeProbe,
} from "./utils/memory/memorySpikeProbe.js";
import { startMemoryMonitor } from "./utils/memoryMonitor.js";

checkEnvVars();

let shuttingDown = false;
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
	logUnknownInput({ logger });

	const app = createHonoApp();

	initPgHealthMonitor({ client: clientCritical });
	startPgPoolMonitor();
	startReplicaRoutingProber({ db });

	const redisWarmup = Promise.all([
		warmupRegionalRedis().catch((error) => {
			console.error("[Redis] regional warmup failed -", error);
		}),
		preWarmOrgRedisConnections({ db }).catch((error) => {
			logger.warn("[OrgRedis] Warmup failed", { error });
		}),
	]);
	void redisWarmup.catch(() => {});

	prewarmMotherDuckResolver();

	await startAllEdgeConfigPolling({ logger });
	void startBalanceWorkerClient().catch((error) => {
		logger.error(
			{ error },
			"[balance-worker] Client startup failed; routing will retry",
		);
	});
	startBalanceShadow();
	await Promise.all([primeRedisMonitor(), primeRedisV2Monitor()]);
	startRedisMonitor();
	startRedisV2Monitor();

	const PORT = process.env.SERVER_PORT
		? Number.parseInt(process.env.SERVER_PORT)
		: 8080;

	const requestListener = getRequestListener(app.fetch);
	const server = http.createServer((req, res) => {
		if (drainState.draining) res.setHeader("connection", "close");
		requestListener(req, res);
	});

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

	await awaitBoundedWarmup({
		warmup: redisWarmup,
		timeoutMs: 10_000,
		log: (message) => console.warn(message),
	});

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

		const numWorkers = getServerForkCount();
		console.log(`Forking ${numWorkers} workers`);

		for (let i = 0; i < numWorkers; i++) {
			cluster.fork();
		}

		const forkRecycling = attachPrimaryForkRecycling({
			clusterModule: cluster,
			shouldRespawn: () => !shuttingDown,
			logger,
		});

		cluster.on("exit", (worker, code, signal) => {
			if (forkRecycling.handleExit(worker)) return;
			if (shuttingDown && (signal === "SIGTERM" || code === 0)) return;
			logger.error("WORKER DIED", {
				pid: worker.process.pid,
				code,
				signal,
				exitedAfterDisconnect: worker.exitedAfterDisconnect,
			});
		});

		const shutdownPrimary = async () => {
			if (shuttingDown) return;
			shuttingDown = true;
			console.log("[Shutdown] primary forwarding SIGTERM to workers");
			for (const worker of Object.values(cluster.workers ?? {})) {
				try {
					worker?.process.kill("SIGTERM");
				} catch {}
			}
			const workersAlive = () =>
				Object.values(cluster.workers ?? {}).filter((w) => w && !w.isDead())
					.length;
			const deadline = Date.now() + 35_000;
			while (workersAlive() > 0 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
			if (workersAlive() > 0) {
				console.warn(
					`[Shutdown] ${workersAlive()} worker(s) still alive after 35s; exiting anyway`,
				);
			}
			const forceExit = setTimeout(() => process.exit(0), 30_000);
			forceExit.unref?.();
			await gracefulShutdown();
		};
		process.on("SIGTERM", () => void shutdownPrimary());
		process.on("SIGINT", () => void shutdownPrimary());
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
				const forceExit = setTimeout(() => process.exit(0), 30_000);
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
		logger.error(event, { error });
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
	const shutdownWithBackstop = () => {
		const forceExit = setTimeout(() => process.exit(0), 30_000);
		forceExit.unref?.();
		void gracefulShutdown();
	};
	process.on("SIGTERM", shutdownWithBackstop);
	process.on("SIGINT", shutdownWithBackstop);
}

async function waitForInFlightRequestsToSettle({
	timeoutMs,
}: {
	timeoutMs: number;
}) {
	const activeWork = () =>
		Math.max(
			listInFlightRequests({ now: Date.now() }).length,
			drainState.getActiveConnectionCount(),
		);
	const deadline = Date.now() + timeoutMs;
	while (activeWork() > 0) {
		if (Date.now() > deadline) {
			console.warn(
				`[Shutdown] proceeding with ${listInFlightRequests({ now: Date.now() }).length} request(s) / ${drainState.getActiveConnectionCount()} connection(s) still active after ${timeoutMs}ms`,
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
		stopAcceptingRequests?.();
		await waitForInFlightRequestsToSettle({ timeoutMs: 10_000 });
		await stopBalanceShadow();
		await stopBalanceWorkerClient();

		if (otelSdk) {
			await otelSdk.shutdown();
		}
		await flushTelemetry();
		shutdownPgHealthMonitor();
		stopPgPoolMonitor();
		stopReplicaRoutingProber();
		stopRedisMonitor();
		stopRedisV2Monitor();
		stopMemorySpikeProbe();
		stopAllEdgeConfigPolling();
		// the SQS batchers at the last possible moment.
		const flushResults = await Promise.allSettled([
			globalEventBatchingManager.flush(),
			globalSyncBatchingManagerV3.flush(),
		]);
		for (const result of flushResults) {
			if (result.status === "rejected") {
				console.warn("[Shutdown] app-level batch flush failed:", result.reason);
			}
		}
		await shutdownSqsSendBatchers();
		await getSqsJobs().shutdown();
		await Promise.all([
			client.end(),
			clientCritical.end(),
			clientReplica?.end(),
			clientReplicaSlow?.end(),
			closeStripeSyncEngine(),
		]);
		console.log("Shutdown complete. Exiting process.");
		process.exit(0);
	} catch (err) {
		console.error("Error during graceful shutdown:", err);
		process.exit(1);
	}
}
