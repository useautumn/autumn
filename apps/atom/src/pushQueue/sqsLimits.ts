/** SQS's most messages per receive. */
export const MAX_PUSHES_PER_PULL = 10;
/** SQS's longest long poll. */
export const LONG_POLL_SECONDS = 20;
/** Above the long poll: a receive the network lost fails instead of hanging its loop. */
export const RECEIVE_TIMEOUT_MS = 25_000;
