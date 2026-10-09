import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tearDownAtomRecord } from "../../atomRecords/tearDownAtomRecord.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import { CACHE_LOCK_TTL_MS, cacheLockKey } from "../../utils/byocCacheUtils.js";
import { cacheDeploymentAtomContext } from "./cacheDeploymentAtomContext.js";
import { startCacheDeploymentWatch } from "./startCacheDeploymentWatch.js";

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

	const remaining = await tearDownAtomRecord({
		ctx: cacheDeploymentAtomContext({
			ctx,
			deploymentGroupId: existing.deployment_group_id,
		}),
		record: existing,
	});
	if (remaining)
		await startCacheDeploymentWatch({
			ctx,
			deploymentGroupId: remaining.deployment_group_id,
		});
};
