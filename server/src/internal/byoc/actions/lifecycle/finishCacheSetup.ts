import { type ApiByocCache, ByocCacheStageStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";
import {
	cacheDeploymentToApiCache,
	cacheNotConnected,
} from "../../utils/byocCacheUtils.js";

export const finishCacheSetup = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiByocCache> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx });
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
