import type { ApiByocCache } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { retryAtomRecord } from "../../atomRecords/retryAtomRecord.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheDeploymentToApiCache,
	cacheLockKey,
	cacheNotFailed,
} from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";

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
	const existing = await cacheDeploymentRepo.find({ ctx });
	if (!existing) throw cacheNotFailed();
	const resumed = await retryAtomRecord({
		ctx: cacheDeploymentAtomContext({
			ctx,
			deploymentGroupId: existing.deployment_group_id,
		}),
		record: existing,
	});
	await startCacheDeploymentWatch({
		ctx,
		deploymentGroupId: resumed.deployment_group_id,
	});
	return cacheDeploymentToApiCache({ cacheDeployment: resumed, org: ctx.org });
};
