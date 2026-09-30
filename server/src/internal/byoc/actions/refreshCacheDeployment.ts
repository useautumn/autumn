import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateCacheDeployment } from "../repos/cacheDeployments.js";
import {
	alienDeploymentToCacheStatus,
	getAlienClientOrThrow,
} from "../utils/byocCacheUtils.js";

/** Reads the deployment's state from alien and saves it when it moved. */
export const refreshCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<ByocCacheDeployment> => {
	const deployment = await getAlienClientOrThrow().findDeployment({
		deploymentGroupId: cacheDeployment.deployment_group_id,
	});
	const refreshed: ByocCacheDeployment = {
		...cacheDeployment,
		deployment_id: deployment?.id ?? null,
		status: alienDeploymentToCacheStatus({ deployment }),
	};
	const hasMoved =
		refreshed.status !== cacheDeployment.status ||
		refreshed.deployment_id !== cacheDeployment.deployment_id;
	if (hasMoved)
		await updateCacheDeployment({ ctx, cacheDeployment: refreshed });
	return refreshed;
};
