import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findCacheDeployment } from "../../../repos/cacheDeployments.js";

/** The record as stored now, never the copy the run started with; null once it no longer follows this group. */
export const setupWatchedCacheDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment | null> => {
	const cacheDeployment = await findCacheDeployment({ ctx });
	const isWatchedGroup =
		cacheDeployment?.deployment_group_id === deploymentGroupId;
	return isWatchedGroup ? cacheDeployment : null;
};
