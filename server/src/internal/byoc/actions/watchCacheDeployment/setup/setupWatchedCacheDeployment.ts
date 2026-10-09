import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findCacheDeploymentByGroupId } from "../../../repos/cacheDeployments.js";

/** The record as stored now, never the copy the run started with; null once no Atom follows this group. */
export const setupWatchedCacheDeployment = ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment | null> =>
	findCacheDeploymentByGroupId({ ctx, deploymentGroupId });
