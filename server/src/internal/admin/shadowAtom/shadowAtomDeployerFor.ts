import type { ShadowAtomConfig } from "@autumn/edge-config";
import { ErrCode, RecaseError } from "@autumn/shared";
import { createMultiTenantAtomDeployer } from "@/internal/byoc/deployers/createMultiTenantAtomDeployer.js";
import type { MultiTenantAtomDeployer } from "@/internal/byoc/deployers/types/multiTenantAtom.js";
import { decryptData } from "@/utils/encryptUtils.js";

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
