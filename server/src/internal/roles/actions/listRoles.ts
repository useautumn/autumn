import type { ApiRole } from "@autumn/shared/api/roles/apiRole";
import { BUILT_IN_ROLES } from "@autumn/shared/utils/roleUtils/builtInRoles";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { roleRepo } from "../repos/index.js";
import { builtInRoleToApiRole } from "../utils/builtInRoleToApiRole.js";
import { customRoleToApiRole } from "../utils/customRoleToApiRole.js";

/** Built-in roles first, then custom roles by name. */
export const listRoles = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiRole[]> => {
	const { db, org } = ctx;
	const [customRoles, usage] = await Promise.all([
		roleRepo.list({ db, orgId: org.id }),
		roleRepo.getUsage({ db, orgId: org.id }),
	]);

	return [
		...BUILT_IN_ROLES.map((role) => builtInRoleToApiRole({ role, usage })),
		...customRoles.map((role) => customRoleToApiRole({ role, usage })),
	];
};
