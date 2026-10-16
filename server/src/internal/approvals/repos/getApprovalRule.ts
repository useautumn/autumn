import {
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared/models/approvalModels/index";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { subjectColumns } from "./subjectColumns.js";

export const getApprovalRule = async ({
	db,
	orgId,
	ruleId,
}: {
	db: DrizzleCli;
	orgId: string;
	ruleId: string;
}): Promise<ApprovalRuleWithSubjects | undefined> =>
	db.query.approvalRules.findFirst({
		where: and(eq(approvalRules.id, ruleId), eq(approvalRules.org_id, orgId)),
		with: { subjects: { columns: subjectColumns } },
	});
