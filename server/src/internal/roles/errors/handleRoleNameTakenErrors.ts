import { isBuiltInRole } from "@autumn/shared/utils/roleUtils/builtInRoles";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { roleRepo } from "../repos/index.js";
import { buildRoleExistsError } from "./buildRoleExistsError.js";

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

	throw buildRoleExistsError({ name });
};
