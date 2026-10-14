import type { SQL } from "drizzle-orm";
import type { Pool } from "pg";
import { logger } from "@/external/logtail/logtailUtils.js";
import { isConnectionDropError } from "./dbUtils.js";
import { type DrizzleCli, dbCritical, dbReplica } from "./initDrizzle.js";

export enum PgHealth {
	Healthy = "HEALTHY",
	Degraded = "DEGRADED",
}

const FAILURE_THRESHOLD = 20;

const FAILURE_WINDOW_MS = 60_000;

const PROBE_INTERVAL_MS = 5_000;

const PROBE_TIMEOUT_MS = 3_000;

const RECOVERY_STABILITY_MS = 10_000;

let state: PgHealth = PgHealth.Healthy;
let probeInterval: ReturnType<typeof setInterval> | null = null;
let firstProbeSuccessAt: number | null = null;
let probeClient: Pool | null = null;

let failureCount = 0;
let windowStartedAt = Date.now();

const resetFailureWindow = (now = Date.now()) => {
	failureCount = 0;
	windowStartedAt = now;
};

export const getDbHealth = (): PgHealth => state;

export const initPgHealthMonitor = ({ client }: { client: Pool }): void => {
	probeClient = client;
	logger.info("[PgHealthMonitor] Initialized", { type: "pg_health_init" });
};

export const recordDbSuccess = (): void => {};

export const recordDbFailure = (): void => {
	if (state === PgHealth.Degraded) return;

	const now = Date.now();

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

	resetFailureWindow();

	startProbe();
};

const switchToHealthy = (): void => {
	if (state === PgHealth.Healthy) return;

	state = PgHealth.Healthy;
	resetFailureWindow();
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
				probeClient.query("SELECT 1"),
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

const SLOW_QUERY_THRESHOLD_MS = 10_000;

export const executeWithHealthTracking = async ({
	db,
	query,
	useReplica,
}: {
	db: DrizzleCli;
	query: SQL;
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
		if (shouldTrackHealth && !isConnectionDropError({ error })) {
			recordDbFailure();
		}
		throw error;
	}
};

export const shutdownPgHealthMonitor = (): void => {
	stopProbe();
};

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

export const forceDegraded = (): void => {
	state = PgHealth.Degraded;
	resetFailureWindow();
	logger.info("[PgHealthMonitor] FORCE DEGRADED (test)", {
		type: "pg_health_force",
	});
};

export const forceHealthy = (): void => {
	state = PgHealth.Healthy;
	resetFailureWindow();
	firstProbeSuccessAt = null;
	stopProbe();
	logger.info("[PgHealthMonitor] FORCE HEALTHY (test)", {
		type: "pg_health_force",
	});
};
