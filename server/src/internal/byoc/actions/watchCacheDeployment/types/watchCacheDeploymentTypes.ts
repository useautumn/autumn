import type { ByocCacheDeployment } from "@autumn/shared";

/** One read of alien: the record as it now stands (null once a delete finished), or alien did not answer. */
export type CacheDeploymentPoll =
	| { ok: true; cacheDeployment: ByocCacheDeployment | null }
	| { ok: false; error: unknown };

export type WatchCacheDeploymentOutcome =
	| "connected"
	| "failed"
	| "teardown_required"
	| "gone"
	| "timed_out";

export type WatchCacheDeploymentStep =
	| { settled: true; outcome: WatchCacheDeploymentOutcome }
	| { settled: false; waitSeconds: number };
