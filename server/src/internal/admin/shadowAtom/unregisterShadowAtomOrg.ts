import type { AppEnv } from "@autumn/shared";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import {
	shadowAtomDeployerFor,
	shadowAtomIdOf,
} from "./shadowAtomDeployerFor.js";

/** Herald and the shadow check stop at once, then the org's folder goes; a retry after a failed delete finishes it. */
export const unregisterShadowAtomOrg = async ({
	env,
	orgId,
}: {
	env: AppEnv;
	orgId: string;
}): Promise<void> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const deployer = shadowAtomDeployerFor({ config: config[env] });
	const { [orgId]: _unregistered, ...orgs } = config[env].orgs;
	await shadowAtomConfigStore.writeToSource({
		config: { ...config, [env]: { ...config[env], orgs } },
	});
	await deployer.unregister({ atomId: shadowAtomIdOf({ orgId, env }) });
};
