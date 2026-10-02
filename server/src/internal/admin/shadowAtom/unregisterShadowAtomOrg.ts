import { AppEnv } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import {
	shadowAtomDeployerFor,
	shadowAtomIdOf,
} from "./shadowAtomDeployerFor.js";

/** Herald and the shadow check stop at once, then both of the org's folders go; a retry after a failed delete finishes it. */
export const unregisterShadowAtomOrg = async ({
	orgId,
}: {
	orgId: string;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: () => forgetOrgAndDeleteFolders({ orgId }),
	});

const forgetOrgAndDeleteFolders = async ({
	orgId,
}: {
	orgId: string;
}): Promise<void> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const deployer = shadowAtomDeployerFor({ config });
	const { [orgId]: _unregistered, ...orgs } = config.orgs;
	await shadowAtomConfigStore.writeToSource({ config: { ...config, orgs } });
	for (const env of [AppEnv.Sandbox, AppEnv.Live])
		await deployer.unregister({ atomId: shadowAtomIdOf({ orgId, env }) });
};
