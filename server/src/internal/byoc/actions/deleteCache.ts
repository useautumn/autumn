import { orgToCacheDeployment } from "@autumn/byoc";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCacheDeployment } from "../repos/cacheDeployments.js";
import { getAlienClientOrThrow } from "../utils/byocCacheUtils.js";

/** Tears down the env's deployment and its setup links in alien, then forgets it. Deleting nothing is a no-op. */
export const deleteCache = async ({ ctx }: { ctx: AutumnContext }) => {
	const existing = orgToCacheDeployment({ org: ctx.org, env: ctx.env });
	if (!existing) return;

	const alienClient = getAlienClientOrThrow();
	const deployment = await alienClient.findDeployment({
		deploymentGroupId: existing.deployment_group_id,
	});
	if (deployment) await alienClient.deleteDeployment({ deployment });
	await alienClient.revokeSetupLinks({
		deploymentGroupId: existing.deployment_group_id,
	});

	await deleteCacheDeployment({ ctx });
};
