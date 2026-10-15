import { type ApiRole, BUILT_IN_ROLES } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { roleRepo } from "../repos/index.js";
import { builtInRoleToApiRole } from "../utils/builtInRoleToApiRole.js";
import { customRoleToApiRole } from "../utils/customRoleToApiRole.js";

/** Built-in roles first, then custom roles by label. */
export const listRoles = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApiRole[]> => {
	const { db, org } = ctx;
	const [customRoles, memberCounts] = await Promise.all([
		roleRepo.list({ db, orgId: org.id }),
		roleRepo.countMembers({ db, orgId: org.id }),
	]);
	const memberCountOf = (name: string) => memberCounts.get(name) ?? 0;

	return [
		...BUILT_IN_ROLES.map((role) =>
			builtInRoleToApiRole({ role, memberCount: memberCountOf(role.name) }),
		),
		...customRoles.map((role) =>
			customRoleToApiRole({ role, memberCount: memberCountOf(role.role) }),
		),
	];
};
