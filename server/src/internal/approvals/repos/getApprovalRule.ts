import {
	type AppEnv,
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { subjectColumns } from "./subjectColumns.js";

export const getApprovalRule = async ({
	db,
	orgId,
	env,
	ruleId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	ruleId: string;
}): Promise<ApprovalRuleWithSubjects | undefined> =>
	db.query.approvalRules.findFirst({
		where: and(
			eq(approvalRules.id, ruleId),
			eq(approvalRules.org_id, orgId),
			eq(approvalRules.env, env),
		),
		with: { subjects: { columns: subjectColumns } },
	});
