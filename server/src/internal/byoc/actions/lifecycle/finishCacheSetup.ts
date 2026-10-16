import { type ApiByocCache, ByocCacheStageStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	cacheDeploymentToApiCache,
	cacheNotConnected,
} from "../../utils/byocCacheUtils.js";

/** The org finished setup on a connected Atom, whether or not a check has reached it yet; its page shows the set-up Atom from then on. */
export const finishCacheSetup = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<ApiByocCache> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx, atomId });
	if (cacheDeployment?.stages.connected !== ByocCacheStageStatus.Done)
		throw cacheNotConnected();
	if (cacheDeployment.first_check_at !== null)
		return cacheDeploymentToApiCache({ cacheDeployment, org: ctx.org });

	const firstCheckAt = Date.now();
	await cacheDeploymentRepo.setFirstCheckAt({
		ctx,
		cacheDeployment,
		firstCheckAt,
	});
	return cacheDeploymentToApiCache({
		cacheDeployment: { ...cacheDeployment, first_check_at: firstCheckAt },
		org: ctx.org,
	});
};
