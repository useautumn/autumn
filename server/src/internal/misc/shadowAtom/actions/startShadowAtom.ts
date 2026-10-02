import type { AppEnv, ByocCacheMachine } from "@autumn/shared";
import type { AtomSetup } from "@/internal/byoc/deployers/types/atomDeployer.js";
import {
	getShadowAtomDeployer,
	SHADOW_ATOM_OWNER,
} from "../getShadowAtomDeployer.js";
import { shadowAtomConfigStore } from "../shadowAtomConfigStore.js";

/** Starts our shadow Atom in shared mode and keeps its deployment group; starting again reuses the group. */
export const startShadowAtom = async ({
	env,
	adminTokenHash,
	machine,
}: {
	env: AppEnv;
	adminTokenHash: string;
	machine: ByocCacheMachine;
}): Promise<AtomSetup> => {
	const setup = await getShadowAtomDeployer().start({
		org: SHADOW_ATOM_OWNER,
		env,
		auth: { mode: "shared", adminTokenHash },
		machine,
	});
	const config = await shadowAtomConfigStore.readFromSource();
	await shadowAtomConfigStore.writeToSource({
		config: {
			...config,
			[env]: { ...config[env], deploymentGroupId: setup.deploymentGroupId },
		},
	});
	return setup;
};
