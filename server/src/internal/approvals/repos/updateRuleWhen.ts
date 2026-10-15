import { approvalRules } from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Rewrites `when` in place, without a new version: a rename fixes a reference, it doesn't edit the rule. */
export const updateRuleWhen = async ({
	db,
	orgId,
	ruleId,
	when,
}: {
	db: DrizzleCli;
	orgId: string;
	ruleId: string;
	when: unknown;
}) => {
	await db
		.update(approvalRules)
		.set({ when })
		.where(and(eq(approvalRules.id, ruleId), eq(approvalRules.org_id, orgId)));
};
