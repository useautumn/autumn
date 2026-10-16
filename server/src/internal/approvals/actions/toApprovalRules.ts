import type { ApprovalRule } from "@autumn/shared";
import type { ApprovalRuleWithSubjects } from "@autumn/shared/models/approvalModels/index";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { listUserNames } from "../repos/listUserNames.js";
import { ruleRowToApprovalRule } from "../utils/ruleRowToApprovalRule.js";

/** Rule rows as API rules, resolving every `updated_by` name in one query. */
export const toApprovalRules = async ({
	db,
	rows,
}: {
	db: DrizzleCli;
	rows: ApprovalRuleWithSubjects[];
}): Promise<ApprovalRule[]> => {
	const userNames = await listUserNames({
		db,
		userIds: rows.map((row) => row.updated_by),
	});
	return rows.map((row) => ruleRowToApprovalRule({ row, userNames }));
};
