import type { AppEnv } from "@autumn/shared";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

/** Tears our shadow Atom down and forgets its endpoint, so the shadow check stops at once. */
export const deleteShadowAtom = async ({
	env,
}: {
	env: AppEnv;
}): Promise<void> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const { deploymentGroupId } = config[env];
	if (deploymentGroupId)
		await getShadowAtomDeployer().delete({ deploymentGroupId });
	await shadowAtomConfigStore.writeToSource({
		config: {
			...config,
			[env]: { ...config[env], deploymentGroupId: null, endpointUrl: null },
		},
	});
};
