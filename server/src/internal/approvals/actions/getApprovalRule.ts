import { AppEnv, type ApprovalRule } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { toApprovalRules } from "./toApprovalRules.js";

export const getApprovalRule = async ({
	ctx,
	ruleId,
}: {
	ctx: AutumnContext;
	ruleId: string;
}): Promise<ApprovalRule> => {
	const row = handleApprovalRuleNotFoundErrors({
		ruleId,
		rule: await approvalRuleRepo.get({
			db: ctx.db,
			orgId: ctx.org.id,
			env: AppEnv.Live,
			ruleId,
		}),
	});
	const [rule] = await toApprovalRules({ db: ctx.db, rows: [row] });
	return rule;
};
