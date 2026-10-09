import { type ApiByocCache, ByocCacheStatus } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import { findCacheDeployment } from "../repos/cacheDeployments.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToApiCache,
	cacheLockKey,
	cacheNotFailed,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";
import { startCacheDeploymentWatch } from "./watchCacheDeployment/startCacheDeploymentWatch.js";

/** Resumes a failed deploy from the step that failed, and watches it again. */
export const retryCache = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache> =>
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"An Atom change is already in progress, try again in a few seconds",
		fn: () => resumeCacheDeploy({ ctx }),
	});

const resumeCacheDeploy = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache> => {
	const existing = await findCacheDeployment({ ctx });
	if (existing?.status !== ByocCacheStatus.Failed) throw cacheNotFailed();

	await getAtomDeployer().retry({
		deploymentGroupId: existing.deployment_group_id,
	});
	const resumed =
		(await refreshCacheDeployment({ ctx, cacheDeployment: existing })) ??
		existing;
	await startCacheDeploymentWatch({
		ctx,
		deploymentGroupId: resumed.deployment_group_id,
	});
	return cacheDeploymentToApiCache({ cacheDeployment: resumed });
};
