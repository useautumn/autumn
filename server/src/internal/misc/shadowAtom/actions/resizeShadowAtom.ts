import type { AppEnv, ByocCacheMachine } from "@autumn/shared";
import { cacheNotRunning } from "@/internal/byoc/utils/byocCacheUtils.js";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

export const resizeShadowAtom = async ({
	env,
	machine,
}: {
	env: AppEnv;
	machine: ByocCacheMachine;
}): Promise<void> => {
	const { deploymentGroupId } = (await shadowAtomConfigStore.readFromSource())[
		env
	];
	if (!deploymentGroupId) throw cacheNotRunning();
	await getShadowAtomDeployer().resize({ deploymentGroupId, machine });
};
