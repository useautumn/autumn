import { AppEnv, approvalRuleSubjects, approvalRules } from "@autumn/shared";
import { and, countDistinct, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Enabled approval rules naming each role in an org; roles no rule names are absent. */
export const countRulesByRole = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<Map<string, number>> => {
	const rows = await db
		.select({
			role: approvalRuleSubjects.subject_id,
			count: countDistinct(approvalRules.id),
		})
		.from(approvalRuleSubjects)
		.innerJoin(
			approvalRules,
			eq(approvalRules.id, approvalRuleSubjects.rule_id),
		)
		.where(
			and(
				eq(approvalRuleSubjects.org_id, orgId),
				eq(approvalRuleSubjects.subject_type, "role"),
				eq(approvalRules.env, AppEnv.Live),
				eq(approvalRules.enabled, true),
			),
		)
		.groupBy(approvalRuleSubjects.subject_id);
	return new Map(rows.map((row) => [row.role, row.count]));
};
