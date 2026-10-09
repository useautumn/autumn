import { ByocCacheStatus } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import { cacheDeploymentRepo } from "../repos/index.js";
import { CACHE_LOCK_TTL_MS, cacheLockKey } from "../utils/byocCacheUtils.js";
import { refreshCacheDeployment } from "./refreshCacheDeployment.js";
import { startCacheDeploymentWatch } from "./watchCacheDeployment/startCacheDeploymentWatch.js";

/** Tears down the env's Atom, or retries one whose removal stopped. The record stays as removing until its stack is gone too. Deleting nothing is a no-op. */
export const deleteCache = ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}) =>
	withLock({
		lockKey: cacheLockKey({ ctx }),
		ttlMs: CACHE_LOCK_TTL_MS,
		errorMessage:
			"An Atom change is already in progress, try again in a few seconds",
		fn: () => tearDownCache({ ctx, atomId }),
	});

const tearDownCache = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}) => {
	const existing = atomId
		? await cacheDeploymentRepo.findById({ ctx, id: atomId })
		: await cacheDeploymentRepo.find({ ctx });
	if (!existing) return;

	await getAtomDeployer().delete({
		deploymentGroupId: existing.deployment_group_id,
	});
	const removing = {
		...existing,
		status: ByocCacheStatus.Removing,
		error: null,
	};
	await cacheDeploymentRepo.update({ ctx, from: existing, to: removing });

	// A setup that never ran has nothing to tear down, so this read forgets it at once.
	const remaining = await refreshCacheDeployment({
		ctx,
		cacheDeployment: removing,
	});
	if (remaining)
		await startCacheDeploymentWatch({
			ctx,
			deploymentGroupId: remaining.deployment_group_id,
		});
};
