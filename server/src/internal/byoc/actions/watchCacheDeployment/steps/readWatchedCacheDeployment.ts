import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cacheDeploymentRepo } from "../../../repos/index.js";

/** The record as stored now, never the copy the run started with; null once no Atom follows this group. */
export const readWatchedCacheDeployment = ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment | null> =>
	cacheDeploymentRepo.findByGroupId({ ctx, deploymentGroupId });
