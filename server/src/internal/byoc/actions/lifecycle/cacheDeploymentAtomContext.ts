import type { ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AtomContext } from "../../atomRecords/types/atomContext.js";
import { getAtomDeployer } from "../../deployers/getAtomDeployer.js";
import { cacheDeploymentRepo } from "../../repos/cacheDeploymentRepo.js";

/** An org's Atom for the shared lifecycle: the server's deployer, and the `atom_deployments` row following its group. */
export const cacheDeploymentAtomContext = ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): AtomContext<ByocCacheDeployment> => ({
	deployer: getAtomDeployer(),
	storage: {
		find: () => cacheDeploymentRepo.findByGroupId({ ctx, deploymentGroupId }),
		update: ({ from, to }) => cacheDeploymentRepo.update({ ctx, from, to }),
		forget: ({ record }) =>
			cacheDeploymentRepo.delete({ ctx, cacheDeployment: record }),
	},
});
