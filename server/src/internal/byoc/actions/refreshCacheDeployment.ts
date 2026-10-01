import { type ByocCacheDeployment, ByocCacheStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import { updateCacheDeployment } from "../repos/cacheDeployments.js";

/** Reads the Atom's state from its deployer and saves it when it moved. */
export const refreshCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<ByocCacheDeployment> => {
	const deployment = await getAtomDeployer().find({
		deploymentGroupId: cacheDeployment.deployment_group_id,
	});
	const refreshed: ByocCacheDeployment = {
		...cacheDeployment,
		deployment_id: deployment?.id ?? null,
		status: deployment?.status ?? ByocCacheStatus.AwaitingSetup,
		endpoint_url: deployment?.endpointUrl ?? null,
		// Until setup creates a deployment, the record keeps the machine its setup asked for.
		cpu: deployment ? (deployment.machine?.cpu ?? null) : cacheDeployment.cpu,
		memory: deployment
			? (deployment.machine?.memory ?? null)
			: cacheDeployment.memory,
	};
	const hasMoved =
		refreshed.status !== cacheDeployment.status ||
		refreshed.deployment_id !== cacheDeployment.deployment_id ||
		refreshed.endpoint_url !== cacheDeployment.endpoint_url ||
		refreshed.cpu !== cacheDeployment.cpu ||
		refreshed.memory !== cacheDeployment.memory;
	if (hasMoved)
		await updateCacheDeployment({ ctx, cacheDeployment: refreshed });
	return refreshed;
};
