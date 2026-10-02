import type { ShadowAtomConfig } from "@autumn/edge-config";
import { type AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { createMultiTenantAtomDeployer } from "@/internal/byoc/deployers/createMultiTenantAtomDeployer.js";
import type { MultiTenantAtomDeployer } from "@/internal/byoc/deployers/types/multiTenantAtom.js";
import { decryptData } from "@/utils/encryptUtils.js";

/** One folder per org per env, so an Atom serving both envs never mixes them. */
export const shadowAtomIdOf = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}): string => `${orgId}.${env}`;

/** Our shadow Atom as its admin reaches it; refused until it has an address and a minted admin token. */
export const shadowAtomDeployerFor = ({
	config,
}: {
	config: ShadowAtomConfig;
}): MultiTenantAtomDeployer => {
	if (!config.endpointUrl || !config.adminEncryptedToken)
		throw new RecaseError({
			message:
				"Set the shadow Atom's endpointUrl and mint its admin token before registering orgs.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	return createMultiTenantAtomDeployer({
		atom: {
			atomUrl: config.endpointUrl,
			adminToken: decryptData(config.adminEncryptedToken),
		},
	});
};
