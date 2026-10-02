import { ErrCode, RecaseError } from "@autumn/shared";
import { getAlienClient } from "@/external/alien/getAlienClient.js";
import { createAlienAtomDeployer } from "./createAlienAtomDeployer.js";
import { createStackAtomDeployer } from "./createStackAtomDeployer.js";
import type { AtomDeployer } from "./types/atomDeployer.js";

let atomDeployer: AtomDeployer | null | undefined;

/** alien where a manager is configured; otherwise the dev stack's own multi-tenant Atom (`ATOM_URL` + `ATOM_ADMIN_TOKEN`). Never the shadow Atom. */
const createAtomDeployer = (): AtomDeployer | null => {
	const alienClient = getAlienClient();
	if (alienClient) return createAlienAtomDeployer({ alienClient });
	const atomUrl = process.env.ATOM_URL;
	const adminToken = process.env.ATOM_ADMIN_TOKEN;
	if (!atomUrl) return null;
	if (!adminToken)
		throw new RecaseError({
			message:
				"ATOM_URL is set without ATOM_ADMIN_TOKEN, so the stack's Atom cannot be reached.",
			code: ErrCode.ByocUnavailable,
			statusCode: 503,
		});
	return createStackAtomDeployer({ atom: { atomUrl, adminToken } });
};

/** The server's one deployer; a 503 where nothing can run an Atom. */
export const getAtomDeployer = (): AtomDeployer => {
	if (atomDeployer === undefined) atomDeployer = createAtomDeployer();
	if (atomDeployer) return atomDeployer;
	throw new RecaseError({
		message: "Cache deployments are not configured on this server.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
	});
};
