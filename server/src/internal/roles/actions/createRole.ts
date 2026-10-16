import type {
	ApiRole,
	CreateRoleParams,
} from "@autumn/shared/api/roles/apiRole";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRoleNameTakenErrors } from "../errors/handleRoleNameTakenErrors.js";
import { withRoleNameConflictAsRoleExists } from "../errors/withRoleNameConflictAsRoleExists.js";
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

	const role = await withRoleNameConflictAsRoleExists({
		name: params.name,
		write: () => roleRepo.insert({ db, orgId: org.id, params }),
	});
	const usage = await roleRepo.getUsage({ db, orgId: org.id });
	return customRoleToApiRole({ role, usage });
};
