import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomConfig } from "./patchShadowAtomConfig.js";

/** Tears our shadow Atom down with its folders, so its endpoint and every org registered on it are forgotten. */
export const deleteShadowAtom = (): Promise<void> =>
	withShadowAtomLock({
		fn: async () => {
			const { deploymentGroupId } =
				await shadowAtomConfigStore.readFromSource();
			if (deploymentGroupId)
				await getShadowAtomDeployer().delete({ deploymentGroupId });
			await patchShadowAtomConfig({
				patch: { deploymentGroupId: null, endpointUrl: null, orgs: {} },
			});
		},
	});
