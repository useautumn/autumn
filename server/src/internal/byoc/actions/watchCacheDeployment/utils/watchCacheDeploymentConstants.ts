import { ByocCacheStatus } from "@autumn/shared";

/** A watch that has not seen its Atom settle by then hands back to page reads. */
export const WATCH_MAX_DURATION_MS = 2 * 60 * 60 * 1000;

/** Slow while the org works in AWS, faster as alien provisions, fastest until Autumn reaches it. */
export const WATCH_POLL_SECONDS: Record<ByocCacheStatus, number> = {
	[ByocCacheStatus.AwaitingSetup]: 15,
	[ByocCacheStatus.Provisioning]: 10,
	[ByocCacheStatus.Ready]: 5,
	[ByocCacheStatus.Failed]: 10,
	[ByocCacheStatus.Removing]: 10,
	[ByocCacheStatus.TeardownRequired]: 15,
};

/** Each poll alien misses doubles the wait from here, up to the cap. */
export const WATCH_BACKOFF_BASE_SECONDS = 10;
export const WATCH_BACKOFF_MAX_SECONDS = 120;
