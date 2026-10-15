import type { ApprovalRuleSubjectRow } from "@autumn/shared/models/approvalModels/index";

/** A subject named twice is the same subject; the table keys on it, so keep one. */
export const uniqueSubjectRows = ({
	rows,
}: {
	rows: ApprovalRuleSubjectRow[];
}): ApprovalRuleSubjectRow[] => [
	...new Map(
		rows.map((row) => [`${row.subject_type}:${row.subject_id}`, row]),
	).values(),
];
