import type { SQL } from "drizzle-orm";
import type postgres from "postgres";
import { logger } from "@/external/logtail/logtailUtils.js";
import { type DrizzleCli, dbCritical, dbReplica } from "./initDrizzle.js";

export enum PgHealth {
	Healthy = "HEALTHY",
	Degraded = "DEGRADED",
}

/**
 * Number of slow/failed queries within the window to trigger DEGRADED.
 * Conservative: 20 slow queries in 60s is a strong signal, not a blip.
 */
const FAILURE_THRESHOLD = 20;

/** Tumbling window size for failure tracking (ms). */
const FAILURE_WINDOW_MS = 60_000;

/** How often to probe the primary when DEGRADED (ms). */
const PROBE_INTERVAL_MS = 5_000;

/** Probe query timeout (ms). */
const PROBE_TIMEOUT_MS = 3_000;

/** How long the primary must be stable before switching back to HEALTHY (ms). */
const RECOVERY_STABILITY_MS = 10_000;

let state: PgHealth = PgHealth.Healthy;
let probeInterval: ReturnType<typeof setInterval> | null = null;
let firstProbeSuccessAt: number | null = null;
let probeClient: postgres.Sql | null = null;

// Lightweight failure tracking — tumbling window with a counter instead of
// an array of timestamps. Two numbers, zero allocations per call.
let failureCount = 0;
let windowStartedAt = Date.now();

/** Get the current DB health state. */
export const getDbHealth = (): PgHealth => state;

/**
 * Initialize the health monitor with a postgres.js client for probing.
 * Call once at startup. The probe client should be the critical pool's raw client.
 */
export const initPgHealthMonitor = ({
	client,
}: {
	client: postgres.Sql;
}): void => {
	probeClient = client;
	logger.info("[PgHealthMonitor] Initialized", { type: "pg_health_init" });
};

/**
 * Record a successful query against the primary DB.
 * No-op: recovery is driven by the probe, not by application queries.
 */
export const recordDbSuccess = (): void => {};

/**
 * Record a slow or failed query against the primary DB.
 * Called when a critical-pool query exceeds the latency threshold or throws.
 */
export const recordDbFailure = (): void => {
	if (state === PgHealth.Degraded) return;

	const now = Date.now();

	// Reset counter if the window has elapsed
	if (now - windowStartedAt > FAILURE_WINDOW_MS) {
		failureCount = 0;
		windowStartedAt = now;
	}

	failureCount++;

	if (failureCount >= FAILURE_THRESHOLD) {
		switchToDegraded();
	}
};

const switchToDegraded = (): void => {
	if (state === PgHealth.Degraded) return;

	state = PgHealth.Degraded;

	logger.error("[PgHealthMonitor] ENTERING DEGRADED MODE", {
		type: "pg_health_degraded",
		failureCount,
		windowMs: FAILURE_WINDOW_MS,
		thresholdCount: FAILURE_THRESHOLD,
	});

	failureCount = 0;
	windowStartedAt = Date.now();

	startProbe();
};

const switchToHealthy = (): void => {
	if (state === PgHealth.Healthy) return;

	state = PgHealth.Healthy;
	failureCount = 0;
	windowStartedAt = Date.now();
	firstProbeSuccessAt = null;

	logger.info("[PgHealthMonitor] RECOVERED to HEALTHY", {
		type: "pg_health_recovered",
	});

	stopProbe();
};

const startProbe = (): void => {
	if (probeInterval || !probeClient) return;

	firstProbeSuccessAt = null;

	probeInterval = setInterval(async () => {
		if (!probeClient) return;

		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				probeClient`SELECT 1`,
				new Promise<never>((_, reject) => {
					timeoutId = setTimeout(
						() => reject(new Error("probe timeout")),
						PROBE_TIMEOUT_MS,
					);
				}),
			]);

			const now = Date.now();
			if (!firstProbeSuccessAt) {
				firstProbeSuccessAt = now;
				logger.info(
					"[PgHealthMonitor] Probe succeeded, waiting for stability",
					{
						type: "pg_health_probe",
					},
				);
			}

			if (now - firstProbeSuccessAt >= RECOVERY_STABILITY_MS) {
				switchToHealthy();
			}
		} catch {
			// Probe failed — reset stability timer
			if (firstProbeSuccessAt) {
				logger.warn(
					"[PgHealthMonitor] Probe failed, resetting stability timer",
					{
						type: "pg_health_probe",
					},
				);
			}
			firstProbeSuccessAt = null;
		} finally {
			clearTimeout(timeoutId);
		}
	}, PROBE_INTERVAL_MS);
};

const stopProbe = (): void => {
	if (probeInterval) {
		clearInterval(probeInterval);
		probeInterval = null;
	}
};

/**
 * Execute a query with automatic health tracking and replica fallback.
 * - If DEGRADED and a replica exists, queries the replica instead.
 * - Tracks latency on critical pool queries: >=10s counts as a failure signal.
 * - Actual errors always count as failures.
 */
const SLOW_QUERY_THRESHOLD_MS = 10_000;

export const executeWithHealthTracking = async ({
	db,
	query,
	useReplica,
}: {
	db: DrizzleCli;
	query: SQL;
	/** Force replica read (for testing replica connectivity in prod). */
	useReplica?: boolean;
}): Promise<{
	result: Record<string, unknown>[];
	usedReplica: boolean;
}> => {
	const isDegraded = state === PgHealth.Degraded;
	const usedReplica =
		(isDegraded && dbReplica !== null) ||
		(useReplica === true && dbReplica !== null);
	const effectiveDb = usedReplica ? dbReplica! : db;

	// Only track health for critical pool queries — prevents general pool
	// saturation from falsely triggering degradation while critical pool is fine.
	const shouldTrackHealth = !isDegraded && db === dbCritical;

	const queryStart = Date.now();
	try {
		const result = await effectiveDb.execute(query);

		if (shouldTrackHealth) {
			const durationMs = Date.now() - queryStart;
			if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
				recordDbFailure();
			} else {
				recordDbSuccess();
			}
		}

		return { result, usedReplica };
	} catch (error) {
		if (shouldTrackHealth) {
			recordDbFailure();
		}
		throw error;
	}
};

/** Clean up the probe interval (for graceful shutdown). */
export const shutdownPgHealthMonitor = (): void => {
	stopProbe();
};

/** Get monitor state for debug endpoints. */
export const getPgHealthState = (): {
	health: PgHealth;
	failureCount: number;
	probeActive: boolean;
	firstProbeSuccessAt: number | null;
	hasReplica: boolean;
} => ({
	health: state,
	failureCount,
	probeActive: probeInterval !== null,
	firstProbeSuccessAt,
	hasReplica: !!process.env.DATABASE_REPLICA_URL,
});

/** Force DEGRADED state (for testing). Does NOT start the recovery probe. */
export const forceDegraded = (): void => {
	state = PgHealth.Degraded;
	failureCount = 0;
	windowStartedAt = Date.now();
	logger.info("[PgHealthMonitor] FORCE DEGRADED (test)", {
		type: "pg_health_force",
	});
};

/** Force HEALTHY state and stop any active probe (for testing). */
export const forceHealthy = (): void => {
	state = PgHealth.Healthy;
	failureCount = 0;
	windowStartedAt = Date.now();
	firstProbeSuccessAt = null;
	stopProbe();
	logger.info("[PgHealthMonitor] FORCE HEALTHY (test)", {
		type: "pg_health_force",
	});
};
