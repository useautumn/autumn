import {
	type ApprovalRuleVersionRow,
	approvalRuleVersions,
} from "@autumn/shared/models/approvalModels/index";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** A rule's saved versions, newest first. */
export const listApprovalRuleVersions = async ({
	db,
	orgId,
	ruleId,
}: {
	db: DrizzleCli;
	orgId: string;
	ruleId: string;
}): Promise<ApprovalRuleVersionRow[]> =>
	db
		.select()
		.from(approvalRuleVersions)
		.where(
			and(
				eq(approvalRuleVersions.rule_id, ruleId),
				eq(approvalRuleVersions.org_id, orgId),
			),
		)
		.orderBy(desc(approvalRuleVersions.version));
