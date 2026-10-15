import { BALANCE_WORKER_DEDUP_WINDOW_MS } from "@autumn/env/balanceWorkerConstants";
import { ms } from "@autumn/shared";

const DEFAULT_HEDGE_MS = 250;

/** Off unless set: a worker-path track whose command-log append fails or stalls is spooled to SQS instead of failing. */
export const isTrackSpoolEnabled = (): boolean =>
	process.env.BALANCE_WORKER_TRACK_SPOOL_ENABLED === "true";

/** How long an append may stay unacked before the track is spooled as well; a healthy append acks in milliseconds. */
export const getTrackSpoolHedgeMs = (): number => {
	const value = Number(process.env.BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS);
	return Number.isFinite(value) && value > 0 ? value : DEFAULT_HEDGE_MS;
};

/** The worker remembers an applied command id in memory for at least its dedup window; a replay later than this,
 *  less a margin for clock skew and consumer lag, could deduct a second time. */
export const SPOOLED_TRACK_MAX_REPLAY_AGE_MS =
	BALANCE_WORKER_DEDUP_WINDOW_MS - ms.minutes(3);
