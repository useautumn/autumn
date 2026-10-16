import { isBuiltInRole } from "@autumn/shared/utils/roleUtils/builtInRoles";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { roleRepo } from "../repos/index.js";
import { buildRoleExistsError } from "./buildRoleExistsError.js";

export const handleRoleIdTakenErrors = async ({
	db,
	orgId,
	id,
}: {
	db: DrizzleCli;
	orgId: string;
	id: string;
}) => {
	const idTaken = isBuiltInRole(id) || (await roleRepo.get({ db, orgId, id }));
	if (!idTaken) return;

	throw buildRoleExistsError({ id });
};
