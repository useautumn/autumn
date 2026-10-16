import type {
	ApiRole,
	UpdateRoleParams,
} from "@autumn/shared/api/roles/apiRole";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleBuiltInRoleErrors } from "../errors/handleBuiltInRoleErrors.js";
import { handleRoleNotFoundErrors } from "../errors/handleRoleNotFoundErrors.js";
import { roleRepo } from "../repos/index.js";
import { customRoleToApiRole } from "../utils/customRoleToApiRole.js";

/** Changes a custom role's name or access. Its id is fixed, so members and rules are untouched. */
export const updateRole = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateRoleParams;
}): Promise<ApiRole> => {
	const { db, org } = ctx;
	handleBuiltInRoleErrors({ id: params.id });

	const role = handleRoleNotFoundErrors({
		id: params.id,
		role: await roleRepo.update({ db, orgId: org.id, params }),
	});
	const usage = await roleRepo.getUsage({ db, orgId: org.id });
	return customRoleToApiRole({ role, usage });
};
