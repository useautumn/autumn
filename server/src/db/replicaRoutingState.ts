import { logger } from "../external/logtail/logtailUtils.js";
import type { DrizzleCli } from "./initDrizzle.js";
import {
	EXPECTED_REPLICA_COUNT,
	REPLICA_LAG_MAX_MS,
} from "./probes/replicaLagProbe.js";
import { queryReplicaLag } from "./probes/replicaLagQuery.js";

export const REPLICA_ROUTING_PROBE_INTERVAL_MS = 3_000;
export const REPLICA_ROUTING_STALENESS_MS = 10_000;

export type ReplicaRoutingReason =
	| "stale_probe"
	| "count_mismatch"
	| "lag_exceeded"
	| "probe_error"
	| "recovered";

export type ReplicaRoutingState = {
	eligible: boolean;
	replicaCount: number;
	maxReplayLagMs: number;
	/** Epoch ms of the last completed probe; 0 = never probed. */
	updatedAt: number;
};

type ProbeResult = {
	replicaCount: number;
	maxReplayLagMs: number;
	updatedAt: number;
	errored: boolean;
	errorMessage: string | null;
};

const neverProbed: ProbeResult = {
	replicaCount: 0,
	maxReplayLagMs: 0,
	updatedAt: 0,
	errored: false,
	errorMessage: null,
};

let lastProbe: ProbeResult = neverProbed;
let lastLoggedEligible = false;
let probeInterval: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

const evaluate = (): { eligible: boolean; reason: ReplicaRoutingReason } => {
	if (Date.now() - lastProbe.updatedAt >= REPLICA_ROUTING_STALENESS_MS) {
		return { eligible: false, reason: "stale_probe" };
	}
	if (lastProbe.errored) {
		return { eligible: false, reason: "probe_error" };
	}
	if (lastProbe.replicaCount !== EXPECTED_REPLICA_COUNT) {
		return { eligible: false, reason: "count_mismatch" };
	}
	if (lastProbe.maxReplayLagMs >= REPLICA_LAG_MAX_MS) {
		return { eligible: false, reason: "lag_exceeded" };
	}
	return { eligible: true, reason: "recovered" };
};

// Once per eligible<->ineligible flip — never per tick, never per request.
const logIfTransitioned = (): boolean => {
	const { eligible, reason } = evaluate();
	if (eligible === lastLoggedEligible) return eligible;
	lastLoggedEligible = eligible;
	logger[eligible ? "info" : "warn"](
		{
			type: "replica_routing_transition",
			to: eligible ? "eligible" : "ineligible",
			reason,
			replica_count: lastProbe.replicaCount,
			max_replay_lag_ms: Math.round(lastProbe.maxReplayLagMs),
			...(lastProbe.errorMessage && { error_message: lastProbe.errorMessage }),
		},
		`Replica routing ${eligible ? "eligible" : `ineligible (${reason})`}`,
	);
	return eligible;
};

const probeTick = async ({ db }: { db: DrizzleCli }): Promise<void> => {
	if (tickInFlight) return;
	tickInFlight = true;
	try {
		const { blind, replicaCount, maxReplayLagMs } = await queryReplicaLag({
			db,
		});
		lastProbe = {
			replicaCount,
			maxReplayLagMs,
			updatedAt: Date.now(),
			errored: blind,
			errorMessage: blind ? "probe not reading a primary" : null,
		};
	} catch (error) {
		lastProbe = {
			replicaCount: 0,
			maxReplayLagMs: 0,
			updatedAt: Date.now(),
			errored: true,
			errorMessage: error instanceof Error ? error.message : String(error),
		};
	} finally {
		tickInFlight = false;
	}
	logIfTransitioned();
};

export const getReplicaRoutingState = (): ReplicaRoutingState => {
	const eligible = logIfTransitioned();
	return {
		eligible,
		replicaCount: lastProbe.replicaCount,
		maxReplayLagMs: lastProbe.maxReplayLagMs,
		updatedAt: lastProbe.updatedAt,
	};
};

export const startReplicaRoutingProber = ({ db }: { db: DrizzleCli }): void => {
	if (!process.env.DATABASE_REPLICA_URL) {
		logger.info(
			{ type: "replica_routing_prober_skipped" },
			"Replica routing prober not started: DATABASE_REPLICA_URL is unset",
		);
		return;
	}
	if (probeInterval) return;
	probeInterval = setInterval(() => {
		void probeTick({ db });
	}, REPLICA_ROUTING_PROBE_INTERVAL_MS);
	void probeTick({ db });
	logger.info(
		{
			type: "replica_routing_prober_start",
			intervalMs: REPLICA_ROUTING_PROBE_INTERVAL_MS,
		},
		"Replica routing prober started",
	);
};

export const stopReplicaRoutingProber = (): void => {
	if (probeInterval) {
		clearInterval(probeInterval);
		probeInterval = null;
	}
};

export const _runProbeTickForTesting = (args: {
	db: DrizzleCli;
}): Promise<void> => probeTick(args);

export const _setReplicaRoutingProbeForTesting = ({
	replicaCount,
	maxReplayLagMs,
}: {
	replicaCount: number;
	maxReplayLagMs: number;
}): void => {
	lastProbe = {
		replicaCount,
		maxReplayLagMs,
		updatedAt: Date.now(),
		errored: false,
		errorMessage: null,
	};
};

export const _resetReplicaRoutingStateForTesting = (): void => {
	stopReplicaRoutingProber();
	lastProbe = { ...neverProbed };
	lastLoggedEligible = false;
	tickInFlight = false;
};
