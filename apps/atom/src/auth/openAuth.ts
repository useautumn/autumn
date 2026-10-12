import type { AtomEnv } from "@autumn/env/atom";
import { createMultiTenantAuth } from "../multiTenant/createMultiTenantAuth.js";
import type { MultiTenantContext } from "../multiTenant/multiTenantContext.js";
import { createHeldSubjects } from "../state/heldSubjects/createHeldSubjects.js";
import type { HeldSubjects } from "../state/heldSubjects/types/heldSubjects.js";
import type { SubjectPulls } from "../subjectPulls/types/subjectPulls.js";
import type { SlotOwners } from "../threads/owners/types/slotOwners.js";
import { createDeployedAuth } from "./createDeployedAuth.js";
import type { Auth } from "./types/auth.js";

/** An org's deployment is given its one token hash; a multi-tenant Atom adds orgs as the admin registers them. */
export const openAuth = ({
	env,
	owners,
	subjectPulls,
}: {
	env: AtomEnv;
	owners: SlotOwners;
	subjectPulls: SubjectPulls;
}): { auth: Auth; multiTenant?: MultiTenantContext; held: HeldSubjects } => {
	// One budget per thread: it owns its slots' subjects, in every folder a multi-tenant Atom holds.
	const held = createHeldSubjects({
		budgetBytes: env.ATOM_HELD_BYTES_PER_THREAD,
	});
	if (env.ATOM_MODE === "deployed") {
		const auth = createDeployedAuth({
			dataDir: env.ATOM_DATA_DIR,
			tokenHash: env.ATOM_TOKEN_HASH,
			slotCount: env.ATOM_SLOT_COUNT,
			owners,
			held,
			subjectPulls,
		});
		return { auth, held };
	}
	const auth = createMultiTenantAuth({
		dataDir: env.ATOM_DATA_DIR,
		slotCount: env.ATOM_SLOT_COUNT,
		owners,
		heldSubjects: held,
		subjectPulls,
	});
	return {
		auth,
		multiTenant: { auth, adminTokenHash: env.ATOM_TOKEN_HASH },
		held,
	};
};
