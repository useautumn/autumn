import {
	type ApprovalRuleSubjectRow,
	approvalRuleSubjects,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Ids of rules naming any of `subjects`; served by `idx_approval_rule_subjects_lookup`. */
export const selectRuleIdsForSubjects = ({
	db,
	orgId,
	subjects,
}: {
	db: DrizzleCli;
	orgId: string;
	subjects: ApprovalRuleSubjectRow[];
}) =>
	db
		.selectDistinct({ rule_id: approvalRuleSubjects.rule_id })
		.from(approvalRuleSubjects)
		.where(
			and(
				eq(approvalRuleSubjects.org_id, orgId),
				or(
					...subjects.map((subject) =>
						and(
							eq(approvalRuleSubjects.subject_type, subject.subject_type),
							eq(approvalRuleSubjects.subject_id, subject.subject_id),
						),
					),
				),
			),
		);
