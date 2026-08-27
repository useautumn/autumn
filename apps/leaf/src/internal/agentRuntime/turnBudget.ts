import { ms } from "@autumn/shared";
import { MESSAGE_TIMEOUT_MS } from "../../lib/chatAgentConfig.js";

/** Every budget below is derived from this one wall clock, so a reader can see
 * that no sub-budget outlives the answer the caller is waiting for. */
export const TURN_WALL_MS = MESSAGE_TIMEOUT_MS;

const BACKSTOP_GRACE_MS = ms.seconds(20);
const SETTLE_GRACE_MS = ms.seconds(30);
/** Measured: a healthy turn can go ~60s between events while the model works a
 * large context, so a window must clear that before it reads as a dead stream. */
const HEALTHY_EVENT_GAP_MS = ms.seconds(60);
const REPLAY_IDLE_DIVISOR = 10;
/** A live child outlives the wall on purpose — leaf answers on time and keeps
 * relaying — so only a multiple of the wall can be the true ceiling. */
const CEILING_WALLS_PER_TURN = 5;

/** The caller's hard kill: the wall plus enough grace that leaf settles the
 * turn itself rather than being cut off mid-settle. */
export const TURN_BACKSTOP_MS = TURN_WALL_MS + BACKSTOP_GRACE_MS;

/** Leaf answers with whatever it has by here, one grace window inside the
 * wall, so a turn eve never resumes still produces a reply. */
export const TURN_SETTLE_BUDGET_MS = TURN_WALL_MS - SETTLE_GRACE_MS;

/** The ceiling on a single turn however busy it looks: a stream that dribbles
 * one event per idle window would otherwise reset the resync budget forever.
 * The only budget that outranks a working child. */
export const MAX_TURN_DURATION_MS = TURN_WALL_MS * CEILING_WALLS_PER_TURN;

/** The one answer to "how long may a stream be quiet before leaf acts": a
 * parent quiet this long with no live child has nothing left to wait for. */
export const MAX_QUIET_MS = TURN_SETTLE_BUDGET_MS;

/** Twice the healthy gap: long enough that a working stream is never cut,
 * short enough to spend the settle budget as windows rather than one stare. */
export const STREAM_IDLE_TIMEOUT_MS = HEALTHY_EVENT_GAP_MS * 2;

/** Reopening at the cursor is cheap and a quiet parent may just be waiting on
 * a child, so the resync budget outlasts the settle budget rather than racing
 * it — the quiet cap and the ceiling decide when a turn is really over. */
export const MAX_IDLE_RESYNCS = 3;

export const CHILD_RELAY_IDLE_TIMEOUT_MS = STREAM_IDLE_TIMEOUT_MS;

/** A child vouches for the parent while it lives, so its relay reconnects
 * through quiet windows until the turn ceiling, not an unrelated count. */
export const MAX_CHILD_IDLE_RECONNECTS = Math.floor(
	MAX_TURN_DURATION_MS / CHILD_RELAY_IDLE_TIMEOUT_MS,
);

/** Replaying a finished child's durable stream waits out network jitter, not
 * thinking time. */
export const CHILD_REPLAY_IDLE_TIMEOUT_MS = Math.floor(
	TURN_SETTLE_BUDGET_MS / REPLAY_IDLE_DIVISOR,
);

export const DRAIN_IDLE_TIMEOUT_MS = STREAM_IDLE_TIMEOUT_MS;

/** Resuming after an approval starts its own wall, so it may wait a whole
 * settle budget for the next park or result. */
export const RESUME_IDLE_TIMEOUT_MS = TURN_SETTLE_BUDGET_MS;

export const STREAM_RETRY_DELAY_MS = ms.seconds(0.5);

/** Eve can close empty while asynchronously resuming a turn. */
export const MAX_IDLE_RETRIES = 20;

export const turnDeadlineFrom = ({ startedAt }: { startedAt: number }) =>
	startedAt + TURN_SETTLE_BUDGET_MS;
