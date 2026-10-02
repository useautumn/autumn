import type { AppEnv } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import {
	shadowAtomDeployerFor,
	shadowAtomIdOf,
} from "./shadowAtomDeployerFor.js";

/** Puts the org on the env's shadow Atom under a fresh token, then records it; registering again rotates the token. */
export const registerShadowAtomOrg = async ({
	ctx,
	env,
	orgId,
}: {
	ctx: AutumnContext;
	env: AppEnv;
	orgId: string;
}): Promise<{ token: string }> => {
	await OrgService.get({ db: ctx.db, orgId });
	return withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: () => putOrgAndRecordToken({ env, orgId }),
	});
};

/** If the config write fails, the Atom already holds the new hash: registering again heals it. */
const putOrgAndRecordToken = async ({
	env,
	orgId,
}: {
	env: AppEnv;
	orgId: string;
}): Promise<{ token: string }> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const { token } = await shadowAtomDeployerFor({
		config: config[env],
	}).register({ atomId: shadowAtomIdOf({ orgId, env }) });
	const registered = {
		encryptedToken: encryptData(token),
		registeredAt: Date.now(),
	};
	// Never mutated in place: a schema default can be one object shared by both envs.
	await shadowAtomConfigStore.writeToSource({
		config: {
			...config,
			[env]: {
				...config[env],
				orgs: { ...config[env].orgs, [orgId]: registered },
			},
		},
	});
	return { token };
};
