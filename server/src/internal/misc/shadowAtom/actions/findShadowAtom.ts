import { type AppEnv, ByocCacheStatus } from "@autumn/shared";
import type { AtomDeployment } from "@/internal/byoc/deployers/types/atomDeployer.js";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";
import { patchShadowAtomEnv } from "./patchShadowAtomEnv.js";

export type ShadowAtomDeployment = AtomDeployment & {
	deploymentGroupId: string;
};

/** Our shadow Atom as alien reports it; its endpoint, or its absence, is saved where the shadow check reads it. */
export const findShadowAtom = async ({
	env,
}: {
	env: AppEnv;
}): Promise<ShadowAtomDeployment | null> => {
	const { deploymentGroupId, endpointUrl } = (
		await shadowAtomConfigStore.readFromSource()
	)[env];
	if (!deploymentGroupId) return null;

	const deployment = await getShadowAtomDeployer().find({ deploymentGroupId });
	const reportedUrl = deployment?.endpointUrl ?? null;
	if (reportedUrl !== endpointUrl)
		await patchShadowAtomEnv({ env, patch: { endpointUrl: reportedUrl } });
	return {
		deploymentGroupId,
		id: deployment?.id ?? deploymentGroupId,
		status: deployment?.status ?? ByocCacheStatus.AwaitingSetup,
		endpointUrl: reportedUrl,
		machine: deployment?.machine ?? null,
	};
};
