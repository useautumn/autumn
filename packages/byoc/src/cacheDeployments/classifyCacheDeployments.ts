import type { AtomRoute, ByocCacheStatus } from "@autumn/shared";

// A literal, not ByocCacheStatus.Ready: this package stays free of runtime imports from the shared barrel.
const READY: ByocCacheStatus = "ready";

/** Writable: setup finished, so alien has a deployment whose KV takes entries. */
export const isByocCacheReady = (
	cacheDeployment: AtomRoute | null,
): cacheDeployment is AtomRoute & { deployment_id: string } =>
	cacheDeployment?.status === READY && cacheDeployment.deployment_id !== null;
