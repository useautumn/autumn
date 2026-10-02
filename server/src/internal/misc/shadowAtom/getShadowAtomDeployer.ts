import { ErrCode, RecaseError } from "@autumn/shared";
import { getAlienClient } from "@/external/alien/getAlienClient.js";
import { createAlienAtomDeployer } from "@/internal/byoc/deployers/createAlienAtomDeployer.js";
import type { AtomDeployer } from "@/internal/byoc/deployers/types/atomDeployer.js";

/** The same alien deployer and stack a customer's Atom uses; a 503 where no alien manager is configured. */
export const getShadowAtomDeployer = (): AtomDeployer => {
	const alienClient = getAlienClient();
	if (alienClient) return createAlienAtomDeployer({ alienClient });
	throw new RecaseError({
		message: "The shadow Atom needs an alien manager on this server.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
	});
};
