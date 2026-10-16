import {
	type ApprovalRuleWithSubjects,
	approvalRules,
	type InsertApprovalRule,
} from "@autumn/shared/models/approvalModels/index";
import { eq, max } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { insertRuleVersion } from "./insertRuleVersion.js";
import { lockOrgApprovalRules } from "./lockOrgApprovalRules.js";
import { replaceRuleSubjects } from "./replaceRuleSubjects.js";

/** Appends a rule to the end of the org's list, with its subjects and version 1, atomically. */
export const insertApprovalRule = async ({
	db,
	orgId,
	rule,
	userId,
}: {
	db: DrizzleCli;
	orgId: string;
	rule: InsertApprovalRule;
	userId: string;
}): Promise<ApprovalRuleWithSubjects> =>
	db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockOrgApprovalRules({ db: tx, orgId });

		const [{ lastPosition }] = await tx
			.select({ lastPosition: max(approvalRules.position) })
			.from(approvalRules)
			.where(eq(approvalRules.org_id, orgId));

		const { subjects, ...fields } = rule;
		const [saved] = await tx
			.insert(approvalRules)
			.values({
				...fields,
				org_id: orgId,
				position: (lastPosition ?? -1) + 1,
				created_by: userId,
				updated_by: userId,
			})
			.returning();

		const inserted = { ...saved, subjects };
		await replaceRuleSubjects({ db: tx, orgId, ruleId: saved.id, subjects });
		await insertRuleVersion({ db: tx, rule: inserted, userId });
		return inserted;
	});
