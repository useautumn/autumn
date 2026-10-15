import { AppEnv, type ApprovalRule } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { toApprovalRules } from "./toApprovalRules.js";

export const getApprovalRule = async ({
	ctx,
	db = ctx.db,
	ruleId,
}: {
	ctx: AutumnContext;
	db?: DrizzleCli;
	ruleId: string;
}): Promise<ApprovalRule> => {
	const row = handleApprovalRuleNotFoundErrors({
		ruleId,
		rule: await approvalRuleRepo.get({
			db,
			orgId: ctx.org.id,
			env: AppEnv.Live,
			ruleId,
		}),
	});
	const [rule] = await toApprovalRules({ db, rows: [row] });
	return rule;
};
