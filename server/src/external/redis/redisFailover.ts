import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";

// ── Config ──────────────────────────────────────────────────────────
/** How long primary must stay down before we switch to failover. */
const FAILOVER_THRESHOLD_MS = 15_000;

/** How long primary must stay healthy before we switch back. */
const RECOVERY_THRESHOLD_MS = 5_000;

/** Health-check polling interval. */
const POLL_INTERVAL_MS = 2_000;

/** Log a warning if blip count exceeds this in the trailing window. */
const BLIP_WARN_THRESHOLD = 10;

/** Trailing window for blip counting. */
const BLIP_WINDOW_MS = 60 * 60 * 1_000; // 1 hour

// ── State machine ───────────────────────────────────────────────────
type FailoverPhase = "NORMAL" | "DEGRADED" | "FAILOVER" | "RECOVERING";

type FailoverState = {
	phase: FailoverPhase;
	active: Redis;
	primary: Redis;
	failover: Redis | null;
	failoverRegion: string | null;
	/** Timestamp when the current phase was entered. */
	phaseEnteredAt: number;
};

let state: FailoverState;
let primaryHasBeenReady = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Tracks timestamps of recent transient blips (DEGRADED → NORMAL). */
const blipTimestamps: number[] = [];

// ── Callbacks ───────────────────────────────────────────────────────
type StateChangeCallback = () => void;
const onChangeCallbacks: StateChangeCallback[] = [];

/** Register a callback invoked whenever `active` changes. */
export const onActiveChange = (cb: StateChangeCallback): void => {
	onChangeCallbacks.push(cb);
};

const notifyChange = (): void => {
	for (const cb of onChangeCallbacks) {
		try {
			cb();
		} catch {}
	}
};

// ── Helpers ─────────────────────────────────────────────────────────
const isPrimaryReady = (): boolean => state.primary.status === "ready";
const isFailoverReady = (): boolean => state.failover?.status === "ready";

const setPhase = (phase: FailoverPhase): void => {
	state.phase = phase;
	state.phaseEnteredAt = Date.now();
};

const msInPhase = (): number => Date.now() - state.phaseEnteredAt;

const pruneBlips = (): void => {
	const cutoff = Date.now() - BLIP_WINDOW_MS;
	while (blipTimestamps.length > 0 && blipTimestamps[0] < cutoff) {
		blipTimestamps.shift();
	}
};

const recordBlip = ({ durationMs }: { durationMs: number }): void => {
	blipTimestamps.push(Date.now());
	pruneBlips();

	logger.warn(
		`[Redis failover] Primary blip #${blipTimestamps.length} (recovered in ${durationMs}ms)`,
		{
			type: "redis_failover_blip",
			blipCount: blipTimestamps.length,
			durationMs,
		},
	);

	if (blipTimestamps.length >= BLIP_WARN_THRESHOLD) {
		logger.error(
			`[Redis failover] ${blipTimestamps.length} blips in the last hour — check Redis health`,
			{
				type: "redis_failover_blip_alert",
				blipCount: blipTimestamps.length,
			},
		);
	}
};

// ── Core poll tick ──────────────────────────────────────────────────
const tick = (): void => {
	const ready = isPrimaryReady();

	switch (state.phase) {
		case "NORMAL": {
			if (!ready && primaryHasBeenReady) {
				setPhase("DEGRADED");
				logger.warn("[Redis failover] Primary unhealthy — entering DEGRADED", {
					type: "redis_failover_degraded",
					primaryStatus: state.primary.status,
				});
			}
			break;
		}

		case "DEGRADED": {
			if (ready) {
				// Blip — primary recovered before we had to failover
				recordBlip({ durationMs: msInPhase() });
				setPhase("NORMAL");
				break;
			}

			if (msInPhase() >= FAILOVER_THRESHOLD_MS) {
				if (!state.failover || !isFailoverReady()) {
					logger.error(
						"[Redis failover] Threshold reached but failover instance not ready",
						{
							type: "redis_failover_switch",
							failoverStatus: state.failover?.status ?? "none",
						},
					);
					break;
				}

				state.active = state.failover;
				setPhase("FAILOVER");
				notifyChange();

				logger.error(
					`[Redis failover] SWITCHED to failover region (${state.failoverRegion})`,
					{
						type: "redis_failover_switch",
						failoverRegion: state.failoverRegion,
					},
				);
			}
			break;
		}

		case "FAILOVER": {
			if (ready) {
				setPhase("RECOVERING");
				logger.info("[Redis failover] Primary back — entering RECOVERING", {
					type: "redis_failover_recovering",
				});
			}
			break;
		}

		case "RECOVERING": {
			if (!ready) {
				// Primary dropped again — go back to failover
				setPhase("FAILOVER");
				logger.warn(
					"[Redis failover] Primary dropped during recovery — back to FAILOVER",
					{ type: "redis_failover_recovery_failed" },
				);
				break;
			}

			if (msInPhase() >= RECOVERY_THRESHOLD_MS) {
				state.active = state.primary;
				setPhase("NORMAL");
				notifyChange();

				logger.info("[Redis failover] RECOVERED to primary region", {
					type: "redis_failover_recovered",
				});
			}
			break;
		}
	}
};

// ── Public API ──────────────────────────────────────────────────────

/** Initialize failover. Call once after creating both Redis instances. */
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
		phase: "NORMAL",
		active: primary,
		primary,
		failover,
		failoverRegion,
		phaseEnteredAt: Date.now(),
	};

	if (!failover) {
		logger.info(
			"[Redis failover] No failover region configured — failover disabled",
			{ type: "redis_failover_init" },
		);
		return;
	}

	logger.info(
		`[Redis failover] Enabled: primary=${currentRegion}, failover=${failoverRegion}`,
		{ type: "redis_failover_init", currentRegion, failoverRegion },
	);

	// Track when primary first connects so we don't failover during startup
	primary.on("ready", () => {
		primaryHasBeenReady = true;
	});

	// Start the single polling loop
	pollTimer = setInterval(tick, POLL_INTERVAL_MS);
};

/** Get the currently active Redis instance. */
export const getActiveRedis = (): Redis => state.active;

/** Get current failover state (for debug/monitoring). */
export const getFailoverState = (): {
	phase: FailoverPhase;
	isUsingFailover: boolean;
	failoverRegion: string | null;
	primaryStatus: string;
	failoverStatus: string | null;
	msInPhase: number;
	blipsLastHour: number;
} => {
	pruneBlips();
	return {
		phase: state.phase,
		isUsingFailover: state.phase === "FAILOVER" || state.phase === "RECOVERING",
		failoverRegion: state.failoverRegion,
		primaryStatus: state.primary.status,
		failoverStatus: state.failover?.status ?? null,
		msInPhase: msInPhase(),
		blipsLastHour: blipTimestamps.length,
	};
};

/** Force disconnect the primary (for testing). */
export const disconnectPrimary = (): void => {
	state.primary.disconnect();
};

/** Force reconnect the primary (for testing). */
export const reconnectPrimary = (): void => {
	state.primary.connect();
};

/** Stop the polling loop (for testing/cleanup). */
export const stopFailoverPolling = (): void => {
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
};
