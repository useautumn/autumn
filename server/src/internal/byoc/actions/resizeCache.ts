import { isByocCacheReady, orgToCacheDeployment } from "@autumn/byoc";
import type { ApiByocCache, ResizeByocCacheParams } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToApiCache,
	cacheLockKey,
	cacheNotRunning,
	resourcesToMachine,
} from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";

/** Moves the env's running Atom to another machine; its balances stay on the volume. */
export const resizeCache = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ResizeByocCacheParams;
}): Promise<ApiByocCache> =>
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"A cache change is already in progress, try again in a few seconds",
		fn: () => moveCacheMachine({ ctx, params }),
	});

const moveCacheMachine = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ResizeByocCacheParams;
}): Promise<ApiByocCache> => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) throw cacheNotRunning();
	const current = await refreshCacheDeployment({
		ctx,
		cacheDeployment: existing,
	});
	if (!isByocCacheReady(current)) throw cacheNotRunning();

	await getAtomDeployer().resize({
		deploymentGroupId: current.deployment_group_id,
		machine: resourcesToMachine(params),
	});

	const resized = await refreshCacheDeployment({
		ctx,
		cacheDeployment: current,
	});
	return cacheDeploymentToApiCache({ cacheDeployment: resized, env: ctx.env });
};
