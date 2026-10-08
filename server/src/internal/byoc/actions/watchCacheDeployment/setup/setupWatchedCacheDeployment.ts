import { orgToCacheDeployment } from "@autumn/byoc";
import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

/** The record as stored now, never the copy the run started with; null once it no longer follows this group. */
export const setupWatchedCacheDeployment = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment | null> => {
	const org = await OrgService.get({ db: ctx.db, orgId: ctx.org.id });
	const cacheDeployment = org && orgToCacheDeployment({ org, env: ctx.env });
	const isWatchedGroup =
		cacheDeployment?.deployment_group_id === deploymentGroupId;
	return isWatchedGroup ? cacheDeployment : null;
};
