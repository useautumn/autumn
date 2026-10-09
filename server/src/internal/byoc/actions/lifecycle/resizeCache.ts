import type { ApiByocCache, ResizeByocCacheParams } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resizeAtomRecord } from "../../atomRecords/resizeAtomRecord.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToApiCache,
	cacheLockKey,
	cacheNotRunning,
	resourcesToMachine,
} from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";

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
			"An Atom change is already in progress, try again in a few seconds",
		fn: () => moveCacheMachine({ ctx, params }),
	});

const moveCacheMachine = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ResizeByocCacheParams;
}): Promise<ApiByocCache> => {
	const existing = await cacheDeploymentRepo.find({ ctx });
	if (!existing) throw cacheNotRunning();
	const resized = await resizeAtomRecord({
		ctx: cacheDeploymentAtomContext({
			ctx,
			deploymentGroupId: existing.deployment_group_id,
		}),
		record: existing,
		machine: resourcesToMachine(params),
	});
	return cacheDeploymentToApiCache({ cacheDeployment: resized, org: ctx.org });
};
