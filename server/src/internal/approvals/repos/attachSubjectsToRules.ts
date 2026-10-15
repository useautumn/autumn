import {
	type ApprovalRuleRow,
	type ApprovalRuleWithSubjects,
	approvalRuleSubjects,
} from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Loads every rule's subjects in one query. */
export const attachSubjectsToRules = async ({
	db,
	rules,
}: {
	db: DrizzleCli;
	rules: ApprovalRuleRow[];
}): Promise<ApprovalRuleWithSubjects[]> => {
	if (rules.length === 0) return [];

	const subjectRows = await db
		.select()
		.from(approvalRuleSubjects)
		.where(
			inArray(
				approvalRuleSubjects.rule_id,
				rules.map((rule) => rule.id),
			),
		);

	return rules.map((rule) => ({
		...rule,
		subjects: subjectRows
			.filter((row) => row.rule_id === rule.id)
			.map(({ subject_type, subject_id }) => ({ subject_type, subject_id })),
	}));
};
