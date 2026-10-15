import type { ApiRole, UpdateRoleParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleBuiltInRoleErrors } from "../errors/handleBuiltInRoleErrors.js";
import { handleRoleNameTakenErrors } from "../errors/handleRoleNameTakenErrors.js";
import { handleRoleNotFoundErrors } from "../errors/handleRoleNotFoundErrors.js";
import { roleRepo } from "../repos/index.js";
import { customRoleToApiRole } from "../utils/customRoleToApiRole.js";

/** Edits a custom role; renaming carries its members, invites and rule subjects along. */
export const updateRole = async ({
	ctx,
	name,
	params,
}: {
	ctx: AutumnContext;
	name: string;
	params: UpdateRoleParams;
}): Promise<ApiRole> => {
	const { db, org } = ctx;
	handleBuiltInRoleErrors({ name });
	handleRoleNotFoundErrors({
		name,
		role: await roleRepo.get({ db, orgId: org.id, name }),
	});

	const newName = params.name;
	const isRename = newName !== undefined && newName !== name;
	if (isRename) {
		await handleRoleNameTakenErrors({ db, orgId: org.id, name: newName });
	}

	const role = await roleRepo.update({ db, orgId: org.id, name, params });
	const usage = await roleRepo.getUsage({ db, orgId: org.id });
	return customRoleToApiRole({ role, usage });
};
