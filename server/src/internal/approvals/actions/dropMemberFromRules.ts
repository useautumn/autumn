import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import { deleteMemberRuleSubjects } from "../repos/deleteMemberRuleSubjects.js";

/** A removed member's rules stop naming them, from the next request on. */
export const dropMemberFromRules = async ({
	db,
	orgId,
	userId,
}: {
	db: DrizzleCli;
	orgId: string;
	userId: string;
}) => {
	await deleteMemberRuleSubjects({ db, orgId, userId });
	await clearApprovalRulesCache({ orgId });
};
