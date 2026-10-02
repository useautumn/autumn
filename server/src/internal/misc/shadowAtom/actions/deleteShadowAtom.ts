import type { AppEnv } from "@autumn/shared";
import { getShadowAtomDeployer } from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomEnv } from "./patchShadowAtomEnv.js";

/** Tears our shadow Atom down with its folders, so its endpoint and every org registered on it are forgotten. */
export const deleteShadowAtom = ({ env }: { env: AppEnv }): Promise<void> =>
	withShadowAtomLock({
		env,
		fn: async () => {
			const { deploymentGroupId } = (
				await shadowAtomConfigStore.readFromSource()
			)[env];
			if (deploymentGroupId)
				await getShadowAtomDeployer().delete({ deploymentGroupId });
			await patchShadowAtomEnv({
				env,
				patch: { deploymentGroupId: null, endpointUrl: null, orgs: {} },
			});
		},
	});
