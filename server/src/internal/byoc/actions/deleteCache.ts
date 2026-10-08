import { orgToCacheDeployment } from "@autumn/byoc";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import { deleteCacheDeployment } from "../repos/cacheDeployments.js";
import { CACHE_LOCK_TTL_MS, cacheLockKey } from "../utils/byocCacheUtils.js";

/** Tears down the env's Atom, then forgets it. Deleting nothing is a no-op. */
export const deleteCache = ({ ctx }: { ctx: AutumnContext }) =>
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"An Atom change is already in progress, try again in a few seconds",
		fn: () => tearDownCache({ ctx }),
	});

const tearDownCache = async ({ ctx }: { ctx: AutumnContext }) => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) return;

	await getAtomDeployer().delete({
		deploymentGroupId: existing.deployment_group_id,
	});
	await deleteCacheDeployment({ ctx, cacheDeployment: existing });
};
