import { scheduleOrgPercent, shadowAtomIdOf } from "@autumn/edge-config";
import { AppEnv } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { shadowAtomDeployerFor } from "./shadowAtomDeployerFor.js";

type EnvTokens = Record<AppEnv, string>;

/** Puts the org on our shadow Atom, a folder per env each under a fresh token, at `percent`; registering again rotates both tokens. */
export const registerShadowAtomOrg = async ({
	ctx,
	orgId,
	percent,
}: {
	ctx: AutumnContext;
	orgId: string;
	percent: number;
}): Promise<{ tokens: EnvTokens }> => {
	await OrgService.get({ db: ctx.db, orgId });
	return withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: () => putOrgAndRecordTokens({ orgId, percent }),
	});
};

/** If the config write fails, the Atom already holds the new hashes: registering again heals it. */
const putOrgAndRecordTokens = async ({
	orgId,
	percent,
}: {
	orgId: string;
	percent: number;
}): Promise<{ tokens: EnvTokens }> => {
	const config = await shadowAtomConfigStore.readFromSource();
	const deployer = shadowAtomDeployerFor({ config });
	const register = async (env: AppEnv) =>
		(await deployer.register({ atomId: shadowAtomIdOf({ orgId, env }) })).token;
	const tokens: EnvTokens = {
		[AppEnv.Sandbox]: await register(AppEnv.Sandbox),
		[AppEnv.Live]: await register(AppEnv.Live),
	};
	const now = Date.now();
	const current = Object.hasOwn(config.orgs, orgId)
		? config.orgs[orgId]
		: undefined;
	const registered = {
		encryptedTokens: {
			sandbox: encryptData(tokens.sandbox),
			live: encryptData(tokens.live),
		},
		registeredAt: now,
		...scheduleOrgPercent({ current, percent, now }),
	};
	// Never mutated in place: a schema default can be one shared object.
	await shadowAtomConfigStore.writeToSource({
		config: { ...config, orgs: { ...config.orgs, [orgId]: registered } },
	});
	return { tokens };
};
