import type { ApiRole, CreateRoleParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRoleNameTakenErrors } from "../errors/handleRoleNameTakenErrors.js";
import { roleRepo } from "../repos/index.js";
import { customRoleToApiRole } from "../utils/customRoleToApiRole.js";

export const createRole = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateRoleParams;
}): Promise<ApiRole> => {
	const { db, org } = ctx;
	await handleRoleNameTakenErrors({ db, orgId: org.id, name: params.name });

	const role = await roleRepo.insert({ db, orgId: org.id, params });
	return customRoleToApiRole({ role, memberCount: 0 });
};
