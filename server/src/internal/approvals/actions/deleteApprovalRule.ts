import { AppEnv } from "@autumn/shared";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { approvalRuleRepo } from "../repos/index.js";

export const deleteApprovalRule = async ({
	ctx,
	ruleId,
}: {
	ctx: AutumnContext;
	ruleId: string;
}) => {
	const deleted = await approvalRuleRepo.delete({
		db: ctx.db,
		orgId: ctx.org.id,
		env: AppEnv.Live,
		ruleId,
	});
	handleApprovalRuleNotFoundErrors({ ruleId, rule: deleted || undefined });
	await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });
};
