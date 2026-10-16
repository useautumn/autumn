import type {
	ApiRole,
	CreateRoleParams,
} from "@autumn/shared/api/roles/apiRole";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRoleIdTakenErrors } from "../errors/handleRoleIdTakenErrors.js";
import { withRoleIdConflictAsRoleExists } from "../errors/withRoleIdConflictAsRoleExists.js";
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
	await handleRoleIdTakenErrors({ db, orgId: org.id, id: params.id });

	const role = await withRoleIdConflictAsRoleExists({
		id: params.id,
		write: () => roleRepo.insert({ db, orgId: org.id, params }),
	});
	const usage = await roleRepo.getUsage({ db, orgId: org.id });
	return customRoleToApiRole({ role, usage });
};
