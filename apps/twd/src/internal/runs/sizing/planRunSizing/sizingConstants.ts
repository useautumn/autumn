/** Share of each per-worker ceiling packing may plan to use. */
export const HEADROOM = 0.65;
export const MAX_AUTO_FILES_PER_WORKER = 4;
/** Sigma multiplier: k files' summed load stays under the ceiling ~97% of the time. */
export const LOAD_SIGMA = 2;
/** Worker count is sized so the LPT makespan stays within this factor of the longest file. */
export const WALL_SLACK = 1.05;
/** Extra workers over the LPT minimum for boot stagger and estimate error; lower it once runs prove parity. */
export const SLOT_SAFETY = 1.3;
/** Expected reruns × this many spare workers, so retries never queue behind first attempts. */
export const RETRY_HEADROOM = 1.5;
/** Overhead quantile: the lightest files' worker-wide load is mostly the idle stack. */
export const OVERHEAD_QUANTILE = 0.1;
/** Stripe's sandbox limit per account; the worker limiter's allowance sits below it. */
export const STRIPE_SANDBOX_ACCOUNT_RPS = 25;
/** Mirrors acquireTwStripePermit.ts: the limiter's connected-account caps. */
export const CONNECTED_ACCOUNT_MAX_RPS = 5;
export const CONNECTED_ACCOUNT_MAX_INFLIGHT = 5;
/** A file whose packed fail rate beats its overall fail rate by this much runs alone from then on. */
export const LEARNED_SOLO_MARGIN = 0.2;
