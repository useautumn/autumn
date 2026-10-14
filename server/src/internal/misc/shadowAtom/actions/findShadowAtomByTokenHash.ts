import { type ShadowAtomConfig, shadowAtomIdOf } from "@autumn/edge-config";
import { isStagingEnv } from "@autumn/env";
import { AppEnv } from "@autumn/shared";
import type { AtomHonoEnv } from "@/internal/byoc/types/atomHonoEnv.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { getShadowAtomConfig } from "../shadowAtomConfigStore.js";

type ShadowAtom = AtomHonoEnv["Variables"]["atom"];

/** Each registered org's folder by its token hash, rebuilt only when the store loads a new config. */
let indexed: {
	config: ShadowAtomConfig;
	byHash: Map<string, ShadowAtom>;
} | null = null;

const indexShadowAtoms = ({
	config,
}: {
	config: ShadowAtomConfig;
}): Map<string, ShadowAtom> => {
	const byHash = new Map<string, ShadowAtom>();
	for (const [orgId, { encryptedTokens }] of Object.entries(config.orgs))
		for (const env of [AppEnv.Sandbox, AppEnv.Live]) {
			const encryptedToken = encryptedTokens[env];
			const token = decryptData(encryptedToken);
			byHash.set(atomTokenToHash({ token }), {
				id: shadowAtomIdOf({ orgId, env }),
				orgId,
				env,
				encryptedToken,
			});
		}
	return byHash;
};

/** Staging only: our shadow Atom's folder its token hash opens, since its tokens live in the shadow config, not atom_deployments. */
export const findShadowAtomByTokenHash = ({
	tokenHash,
}: {
	tokenHash: string;
}): ShadowAtom | null => {
	if (!isStagingEnv({ runtimeEnv: process.env })) return null;
	const config = getShadowAtomConfig();
	if (indexed?.config !== config)
		indexed = { config, byHash: indexShadowAtoms({ config }) };
	return indexed.byHash.get(tokenHash) ?? null;
};
