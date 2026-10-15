import type { ApprovalRuleVersion } from "@autumn/shared/api/approvals/crud/approvalRuleVersion";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { listUserNames } from "../repos/listUserNames.js";
import { versionRowToApprovalRuleVersion } from "../utils/versionRowToApprovalRuleVersion.js";

/** A rule's saved versions, newest first; still readable after the rule is deleted. */
export const listApprovalRuleVersions = async ({
	ctx,
	ruleId,
}: {
	ctx: AutumnContext;
	ruleId: string;
}): Promise<ApprovalRuleVersion[]> => {
	const rows = await approvalRuleRepo.listVersions({
		db: ctx.db,
		orgId: ctx.org.id,
		ruleId,
	});
	// Deleted rules keep their history; an id with none never existed.
	handleApprovalRuleNotFoundErrors({ ruleId, rule: rows[0] });

	const userNames = await listUserNames({
		db: ctx.db,
		userIds: rows.map((row) => row.created_by),
	});
	return rows.map((row) => versionRowToApprovalRuleVersion({ row, userNames }));
};
