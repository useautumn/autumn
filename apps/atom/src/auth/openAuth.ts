import type { AtomEnv } from "@autumn/env/atom";
import { createMultiTenantAuth } from "../multiTenant/createMultiTenantAuth.js";
import type { MultiTenantContext } from "../multiTenant/multiTenantContext.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import { createDeployedAuth } from "./createDeployedAuth.js";
import type { Auth } from "./types/auth.js";

/** An org's deployment is given its one token hash; a multi-tenant Atom adds orgs as the admin registers them. */
export const openAuth = ({
	env,
	owners,
}: {
	env: AtomEnv;
	owners: SlotOwners;
}): { auth: Auth; multiTenant?: MultiTenantContext } => {
	if (env.ATOM_MODE === "deployed") {
		const auth = createDeployedAuth({
			dataDir: env.ATOM_DATA_DIR,
			tokenHash: env.ATOM_TOKEN_HASH,
			slotCount: env.ATOM_SLOT_COUNT,
			owners,
		});
		return { auth };
	}
	const auth = createMultiTenantAuth({
		dataDir: env.ATOM_DATA_DIR,
		slotCount: env.ATOM_SLOT_COUNT,
		owners,
	});
	return {
		auth,
		multiTenant: { auth, adminTokenHash: env.ATOM_TOKEN_HASH },
	};
};
