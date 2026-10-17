import {
	approvalRuleSubjects,
	approvalRules,
} from "@autumn/shared/models/approvalModels/index";
import { and, asc, eq, inArray, notExists } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { lockOrgApprovalRules } from "./lockOrgApprovalRules.js";

/**
 * A deleted role stops being named, so a role later created with the same id inherits nothing.
 * A rule left naming no one is disabled rather than deleted, so an admin can still see it.
 */
export const deleteRoleRuleSubjects = async ({
	db,
	orgId,
	roleId,
}: {
	db: DrizzleCli;
	orgId: string;
	roleId: string;
}) => {
	const namesRole = and(
		eq(approvalRuleSubjects.org_id, orgId),
		eq(approvalRuleSubjects.subject_type, "role"),
		eq(approvalRuleSubjects.subject_id, roleId),
	);
	// Rule saves take the org lock, then the rule row, then its subjects; same order here.
	// Under that lock a save can't add this role to another rule once the delete has started.
	await lockOrgApprovalRules({ db, orgId });
	await db
		.select({ id: approvalRules.id })
		.from(approvalRules)
		.where(
			inArray(
				approvalRules.id,
				db
					.select({ rule_id: approvalRuleSubjects.rule_id })
					.from(approvalRuleSubjects)
					.where(namesRole),
			),
		)
		.orderBy(asc(approvalRules.id))
		.for("update");

	await db.delete(approvalRuleSubjects).where(namesRole);
	await db
		.update(approvalRules)
		.set({ enabled: false })
		.where(
			and(
				eq(approvalRules.org_id, orgId),
				eq(approvalRules.enabled, true),
				notExists(
					db
						.select({ rule_id: approvalRuleSubjects.rule_id })
						.from(approvalRuleSubjects)
						.where(eq(approvalRuleSubjects.rule_id, approvalRules.id)),
				),
			),
		);
};
