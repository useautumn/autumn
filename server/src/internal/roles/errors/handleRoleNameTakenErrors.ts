import { ErrCode, isBuiltInRole, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { roleRepo } from "../repos/index.js";

export const handleRoleNameTakenErrors = async ({
	db,
	orgId,
	name,
}: {
	db: DrizzleCli;
	orgId: string;
	name: string;
}) => {
	const nameTaken =
		isBuiltInRole(name) || (await roleRepo.get({ db, orgId, name }));
	if (!nameTaken) return;

	throw new RecaseError({
		message: `A role named ${name} already exists. Pick another name.`,
		code: ErrCode.RoleExists,
		statusCode: 409,
	});
};
