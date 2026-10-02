import type { AppEnv, ByocCacheMachine } from "@autumn/shared";
import type { AtomSetup } from "@/internal/byoc/deployers/types/atomDeployer.js";
import {
	getShadowAtomDeployer,
	SHADOW_ATOM_OWNER,
} from "../getShadowAtomDeployer.js";
import { withShadowAtomLock } from "../withShadowAtomLock.js";
import { patchShadowAtomEnv } from "./patchShadowAtomEnv.js";

/** Starts our shadow Atom in multi-tenant mode and keeps its deployment group; starting again reuses the group. */
export const startShadowAtom = ({
	env,
	adminTokenHash,
	machine,
}: {
	env: AppEnv;
	adminTokenHash: string;
	machine: ByocCacheMachine;
}): Promise<AtomSetup> =>
	withShadowAtomLock({
		env,
		fn: async () => {
			const setup = await getShadowAtomDeployer().start({
				org: SHADOW_ATOM_OWNER,
				env,
				auth: { mode: "multi_tenant", adminTokenHash },
				machine,
			});
			await patchShadowAtomEnv({
				env,
				patch: { deploymentGroupId: setup.deploymentGroupId },
			});
			return setup;
		},
	});
