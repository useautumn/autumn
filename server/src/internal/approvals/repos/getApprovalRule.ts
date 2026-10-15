import {
	type AppEnv,
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { attachSubjectsToRules } from "./attachSubjectsToRules.js";

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
}): Promise<ApprovalRuleWithSubjects | undefined> => {
	const rules = await db
		.select()
		.from(approvalRules)
		.where(
			and(
				eq(approvalRules.id, ruleId),
				eq(approvalRules.org_id, orgId),
				eq(approvalRules.env, env),
			),
		);

	const [rule] = await attachSubjectsToRules({ db, rules });
	return rule;
};
