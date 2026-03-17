import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";

/** How long primary must be erroring before we switch to failover. */
const FAILOVER_DELAY_MS = 5_000;

/** How long primary must be stable before we switch back from failover. */
const RECOVERY_DELAY_MS = 3_000;

export type RedisFailoverState = {
	/** The currently active Redis instance (what consumers use). */
	active: Redis;
	/** Always the current region's instance. */
	primary: Redis;
	/** The other region's instance (null if only one region configured). */
	failover: Redis | null;
	/** Whether we're currently using the failover instance. */
	isUsingFailover: boolean;
	/** Region name of the failover instance. */
	failoverRegion: string | null;
};

let state: RedisFailoverState;
let primaryErrorSince: number | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let primaryHasBeenReady = false;

/** Initialize failover state. Call once after creating both Redis instances. */
export const initFailover = ({
	primary,
	failover,
	failoverRegion,
	currentRegion,
}: {
	primary: Redis;
	failover: Redis | null;
	failoverRegion: string | null;
	currentRegion: string;
}): void => {
	state = {
		active: primary,
		primary,
		failover,
		isUsingFailover: false,
		failoverRegion,
	};

	if (!failover) {
		logger.info(
			"[Redis failover] No failover region configured — failover disabled",
			{
				type: "redis_failover_init",
			},
		);
		return;
	}

	logger.info(
		`[Redis failover] Enabled: primary=${currentRegion}, failover=${failoverRegion}`,
		{
			type: "redis_failover_init",
			currentRegion,
			failoverRegion,
		},
	);

	const onPrimaryDown = () => {
		// Don't trigger failover during initial startup — only after
		// the primary has successfully connected at least once.
		if (!primaryHasBeenReady) return;

		if (!primaryErrorSince) {
			primaryErrorSince = Date.now();

			// Schedule failover after the delay
			setTimeout(() => {
				if (primaryErrorSince && primary.status !== "ready") {
					switchToFailover();
				}
			}, FAILOVER_DELAY_MS);
		}
	};

	// Listen to all events that indicate the primary is unhealthy
	primary.on("error", onPrimaryDown);
	primary.on("close", onPrimaryDown);
	primary.on("end", onPrimaryDown);

	primary.on("ready", () => {
		primaryHasBeenReady = true;
		primaryErrorSince = null;

		if (!state.isUsingFailover) return;

		// Primary recovered — wait for stability before switching back
		if (!recoveryTimer) {
			recoveryTimer = setTimeout(() => {
				recoveryTimer = null;
				if (primary.status === "ready") {
					switchToPrimary();
				}
			}, RECOVERY_DELAY_MS);
		}
	});
};

const switchToFailover = (): void => {
	if (!state.failover || state.isUsingFailover) return;
	if (state.failover.status !== "ready") {
		logger.error(
			"[Redis failover] Cannot switch — failover instance is not ready",
			{
				type: "redis_failover_switch",
				failoverStatus: state.failover.status,
			},
		);
		return;
	}

	state.active = state.failover;
	state.isUsingFailover = true;
	logger.error(
		`[Redis failover] SWITCHED to failover region (${state.failoverRegion})`,
		{
			type: "redis_failover_switch",
			failoverRegion: state.failoverRegion,
		},
	);
};

const switchToPrimary = (): void => {
	if (!state.isUsingFailover) return;

	state.active = state.primary;
	state.isUsingFailover = false;
	primaryErrorSince = null;
	logger.info("[Redis failover] RECOVERED to primary region", {
		type: "redis_failover_recovered",
	});
};

/** Get the currently active Redis instance. */
export const getActiveRedis = (): Redis => state.active;

/** Get the current failover state (for debug/monitoring). */
export const getFailoverState = (): {
	isUsingFailover: boolean;
	failoverRegion: string | null;
	primaryStatus: string;
	failoverStatus: string | null;
	primaryErrorSince: number | null;
} => ({
	isUsingFailover: state.isUsingFailover,
	failoverRegion: state.failoverRegion,
	primaryStatus: state.primary.status,
	failoverStatus: state.failover?.status ?? null,
	primaryErrorSince,
});

/**
 * Force disconnect the primary instance (for testing).
 * ioredis will NOT auto-reconnect after a manual disconnect() call.
 * Use `reconnectPrimary()` to manually reconnect.
 */
export const disconnectPrimary = (): void => {
	state.primary.disconnect();
};

/** Force reconnect the primary instance (for testing). */
export const reconnectPrimary = (): void => {
	state.primary.connect();
};
