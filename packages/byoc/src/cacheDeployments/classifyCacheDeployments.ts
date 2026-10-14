import type { AtomRoute, ByocCacheStatus } from "@autumn/shared";

const READY: ByocCacheStatus = "ready";

export const isByocCacheReady = <
	T extends Pick<AtomRoute, "status" | "deployment_id">,
>(
	cacheDeployment: T | null,
): cacheDeployment is T & { deployment_id: string } =>
	cacheDeployment?.status === READY && cacheDeployment.deployment_id !== null;
