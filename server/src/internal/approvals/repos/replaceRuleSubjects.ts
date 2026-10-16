import {
	type ApprovalRuleSubjectRow,
	approvalRuleSubjects,
} from "@autumn/shared/models/approvalModels/index";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const replaceRuleSubjects = async ({
	db,
	orgId,
	ruleId,
	subjects,
}: {
	db: DrizzleCli;
	orgId: string;
	ruleId: string;
	subjects: ApprovalRuleSubjectRow[];
}) => {
	await db
		.delete(approvalRuleSubjects)
		.where(eq(approvalRuleSubjects.rule_id, ruleId));
	if (subjects.length === 0) return;

	await db
		.insert(approvalRuleSubjects)
		.values(
			subjects.map((subject) => ({
				...subject,
				rule_id: ruleId,
				org_id: orgId,
			})),
		);
};
