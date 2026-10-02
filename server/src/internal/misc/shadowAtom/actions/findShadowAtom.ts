import { type AppEnv, ByocCacheStatus } from "@autumn/shared";
import type { AtomDeployment } from "@/internal/byoc/deployers/types/atomDeployer.js";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

export type ShadowAtomDeployment = AtomDeployment & {
	deploymentGroupId: string;
};

/** Our shadow Atom as alien reports it; once it answers, its endpoint is saved where the shadow check reads it. */
export const findShadowAtom = async ({
	env,
}: {
	env: AppEnv;
}): Promise<ShadowAtomDeployment | null> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const { deploymentGroupId, endpointUrl } = config[env];
	if (!deploymentGroupId) return null;

	const deployment = await getShadowAtomDeployer().find({ deploymentGroupId });
	if (deployment?.endpointUrl && deployment.endpointUrl !== endpointUrl) {
		await shadowAtomConfigStore.writeToSource({
			config: {
				...config,
				[env]: { ...config[env], endpointUrl: deployment.endpointUrl },
			},
		});
	}
	return {
		deploymentGroupId,
		id: deployment?.id ?? deploymentGroupId,
		status: deployment?.status ?? ByocCacheStatus.AwaitingSetup,
		endpointUrl: deployment?.endpointUrl ?? null,
		machine: deployment?.machine ?? null,
	};
};
