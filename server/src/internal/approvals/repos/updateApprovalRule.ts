import {
	type ApprovalRuleWithSubjects,
	approvalRules,
	type UpdateApprovalRule,
} from "@autumn/shared/models/approvalModels/index";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getApprovalRule } from "./getApprovalRule.js";
import { insertRuleVersion } from "./insertRuleVersion.js";
import { replaceRuleSubjects } from "./replaceRuleSubjects.js";

/** Saves changed fields as the next version. Returns undefined, writing nothing, if the rule isn't in the org. */
export const updateApprovalRule = async ({
	db,
	orgId,
	rule,
	userId,
}: {
	db: DrizzleCli;
	orgId: string;
	rule: UpdateApprovalRule;
	userId: string;
}): Promise<ApprovalRuleWithSubjects | undefined> =>
	db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		const { id, subjects, ...fields } = rule;

		const [saved] = await tx
			.update(approvalRules)
			.set({
				...fields,
				version: sql`${approvalRules.version} + 1`,
				updated_by: userId,
				updated_at: Date.now(),
			})
			.where(and(eq(approvalRules.id, id), eq(approvalRules.org_id, orgId)))
			.returning();
		if (!saved) return undefined;

		if (subjects) {
			await replaceRuleSubjects({ db: tx, orgId, ruleId: id, subjects });
		}
		const updated = await getApprovalRule({ db: tx, orgId, ruleId: id });
		if (updated) await insertRuleVersion({ db: tx, rule: updated, userId });
		return updated;
	});
