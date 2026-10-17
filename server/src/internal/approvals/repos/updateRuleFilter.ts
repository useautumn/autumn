import { approvalRules } from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Rewrites `filter` in place, without a new version: a rename fixes a reference, it doesn't edit the rule. */
export const updateRuleFilter = async ({
	db,
	orgId,
	ruleId,
	filter,
}: {
	db: DrizzleCli;
	orgId: string;
	ruleId: string;
	filter: unknown;
}) => {
	await db
		.update(approvalRules)
		.set({ filter })
		.where(and(eq(approvalRules.id, ruleId), eq(approvalRules.org_id, orgId)));
};
