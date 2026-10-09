import type { AtomRoute, ByocCacheStatus } from "@autumn/shared";

// A literal, not ByocCacheStatus.Ready: this package stays free of runtime imports from the shared barrel.
const READY: ByocCacheStatus = "ready";

/** Writable: setup finished, so alien has a deployment whose KV takes entries. */
export const isByocCacheReady = <
	T extends Pick<AtomRoute, "status" | "deployment_id">,
>(
	cacheDeployment: T | null,
): cacheDeployment is T & { deployment_id: string } =>
	cacheDeployment?.status === READY && cacheDeployment.deployment_id !== null;
