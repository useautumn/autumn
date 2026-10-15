import {
	type AppEnv,
	type ApprovalRuleSubjectRow,
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared";
import { and, arrayContains, asc, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { attachSubjectsToRules } from "./attachSubjectsToRules.js";
import { selectRuleIdsForSubjects } from "./selectRuleIdsForSubjects.js";

/** Rules for an org, oldest first, optionally narrowed to enabled ones, one action, or rules naming any of `subjects`. */
export const listApprovalRules = async ({
	db,
	orgId,
	env,
	enabled,
	action,
	subjects,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	enabled?: boolean;
	action?: string;
	subjects?: ApprovalRuleSubjectRow[];
}): Promise<ApprovalRuleWithSubjects[]> => {
	if (subjects?.length === 0) return [];

	const rules = await db
		.select()
		.from(approvalRules)
		.where(
			and(
				eq(approvalRules.org_id, orgId),
				eq(approvalRules.env, env),
				enabled === undefined ? undefined : eq(approvalRules.enabled, enabled),
				action ? arrayContains(approvalRules.actions, [action]) : undefined,
				subjects
					? inArray(
							approvalRules.id,
							selectRuleIdsForSubjects({ db, orgId, subjects }),
						)
					: undefined,
			),
		)
		.orderBy(asc(approvalRules.created_at), asc(approvalRules.id));

	return attachSubjectsToRules({ db, rules });
};
