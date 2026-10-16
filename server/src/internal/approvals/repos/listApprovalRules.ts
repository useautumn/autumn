import {
	type ApprovalRuleSubjectRow,
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared/models/approvalModels/index";
import { and, arrayContains, asc, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { selectRuleIdsForSubjects } from "./selectRuleIdsForSubjects.js";
import { subjectColumns } from "./subjectColumns.js";

/** Rules for an org in list order, optionally narrowed to enabled ones, one action, or rules naming any of `subjects`. */
export const listApprovalRules = async ({
	db,
	orgId,
	enabled,
	action,
	subjects,
}: {
	db: DrizzleCli;
	orgId: string;
	enabled?: boolean;
	action?: string;
	subjects?: ApprovalRuleSubjectRow[];
}): Promise<ApprovalRuleWithSubjects[]> => {
	if (subjects?.length === 0) return [];

	return db.query.approvalRules.findMany({
		where: and(
			eq(approvalRules.org_id, orgId),
			enabled === undefined ? undefined : eq(approvalRules.enabled, enabled),
			action ? arrayContains(approvalRules.actions, [action]) : undefined,
			subjects
				? inArray(
						approvalRules.id,
						selectRuleIdsForSubjects({ db, orgId, subjects }),
					)
				: undefined,
		),
		with: { subjects: { columns: subjectColumns } },
		orderBy: [asc(approvalRules.position), asc(approvalRules.id)],
	});
};
