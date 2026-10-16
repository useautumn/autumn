import type { GetAtomUpdateResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../../deployers/getAtomDeployer.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";

/** The latest change alien applied to the Atom's deployment, read live so a reload shows a grow still running. */
export const getCacheUpdate = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<GetAtomUpdateResponse> => {
	const cacheDeployment = await cacheDeploymentRepo.find({ ctx, atomId });
	if (!cacheDeployment) return { update: null };
	const deployment = await getAtomDeployer().find({
		deploymentGroupId: cacheDeployment.deployment_group_id,
		deploymentId: cacheDeployment.deployment_id,
	});
	return { update: deployment?.update ?? null };
};
