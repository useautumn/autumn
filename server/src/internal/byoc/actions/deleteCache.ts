import { orgToCacheDeployment } from "@autumn/byoc";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCacheDeployment } from "../repos/cacheDeployments.js";
import {
	CACHE_LOCK_TTL_MS,
	cacheLockKey,
	getAlienClientOrThrow,
} from "../utils/byocCacheUtils.js";

/** Tears down the env's deployment and its setup links in alien, then forgets it. Deleting nothing is a no-op. */
export const deleteCache = ({ ctx }: { ctx: AutumnContext }) =>
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"A cache change is already in progress, try again in a few seconds",
		fn: () => tearDownCache({ ctx }),
	});

const tearDownCache = async ({ ctx }: { ctx: AutumnContext }) => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) return;

	const alienClient = getAlienClientOrThrow();
	const deployment = await alienClient.findDeployment({
		deploymentGroupId: existing.deployment_group_id,
	});
	if (deployment) await alienClient.deleteDeployment({ deployment });
	await alienClient.revokeSetupLinks({
		deploymentGroupId: existing.deployment_group_id,
	});

	await deleteCacheDeployment({ ctx, cacheDeployment: existing });
};
