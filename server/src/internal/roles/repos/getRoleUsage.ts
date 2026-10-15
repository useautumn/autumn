import type { DrizzleCli } from "@/db/initDrizzle.js";
import { countMembersByRole } from "./countMembersByRole.js";
import { countRulesByRole } from "./countRulesByRole.js";

/** Members holding, and enabled rules naming, each role in an org. */
export type RoleUsage = {
	members: Map<string, number>;
	rules: Map<string, number>;
};

export const getRoleUsage = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<RoleUsage> => {
	const [members, rules] = await Promise.all([
		countMembersByRole({ db, orgId }),
		countRulesByRole({ db, orgId }),
	]);
	return { members, rules };
};
