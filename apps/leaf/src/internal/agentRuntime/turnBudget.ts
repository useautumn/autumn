import { ms } from "@autumn/shared";
import { MESSAGE_TIMEOUT_MS } from "../../lib/chatAgentConfig.js";

export const TURN_WALL_MS = MESSAGE_TIMEOUT_MS;

const BACKSTOP_GRACE_MS = ms.seconds(20);
const SETTLE_GRACE_MS = ms.seconds(30);
const HEALTHY_EVENT_GAP_MS = ms.seconds(60);
const REPLAY_IDLE_DIVISOR = 10;
const CEILING_WALLS_PER_TURN = 5;

export const TURN_BACKSTOP_MS = TURN_WALL_MS + BACKSTOP_GRACE_MS;

export const TURN_SETTLE_BUDGET_MS = TURN_WALL_MS - SETTLE_GRACE_MS;

export const MAX_TURN_DURATION_MS = TURN_WALL_MS * CEILING_WALLS_PER_TURN;

export const MAX_QUIET_MS = TURN_SETTLE_BUDGET_MS;

export const STREAM_IDLE_TIMEOUT_MS = HEALTHY_EVENT_GAP_MS * 2;

export const MAX_IDLE_RESYNCS = 3;

export const CHILD_RELAY_IDLE_TIMEOUT_MS = STREAM_IDLE_TIMEOUT_MS;

export const MAX_CHILD_IDLE_RECONNECTS = Math.floor(
	MAX_TURN_DURATION_MS / CHILD_RELAY_IDLE_TIMEOUT_MS,
);

export const CHILD_REPLAY_IDLE_TIMEOUT_MS = Math.floor(
	TURN_SETTLE_BUDGET_MS / REPLAY_IDLE_DIVISOR,
);

export const DRAIN_IDLE_TIMEOUT_MS = STREAM_IDLE_TIMEOUT_MS;

export const RESUME_IDLE_TIMEOUT_MS = TURN_SETTLE_BUDGET_MS;

export const STREAM_RETRY_DELAY_MS = ms.seconds(0.5);

export const MAX_IDLE_RETRIES = 20;

export const turnDeadlineFrom = ({ startedAt }: { startedAt: number }) =>
	startedAt + TURN_SETTLE_BUDGET_MS;
