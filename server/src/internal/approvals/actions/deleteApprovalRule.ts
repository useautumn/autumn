import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { handleRuleEditorErrors } from "../errors/handleRuleEditorErrors.js";
import { approvalRuleRepo } from "../repos/index.js";

/** Deletes a rule and its subjects; its versions stay readable in History. */
export const deleteApprovalRule = async ({
	ctx,
	ruleId,
}: {
	ctx: AutumnContext;
	ruleId: string;
}) => {
	const { db, org } = ctx;
	handleRuleEditorErrors({ ctx });

	const deleted = await approvalRuleRepo.delete({ db, orgId: org.id, ruleId });
	handleApprovalRuleNotFoundErrors({ ruleId, rule: deleted || undefined });
	await clearApprovalRulesCache({ orgId: org.id });
};
