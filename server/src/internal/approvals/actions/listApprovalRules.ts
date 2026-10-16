import { AppEnv, type ApprovalRule, type RuleSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { approvalRuleRepo } from "../repos/index.js";
import { ruleSubjectToRow } from "../utils/ruleSubjectToRow.js";
import { toApprovalRules } from "./toApprovalRules.js";

export const listApprovalRules = async ({
	ctx,
	subject,
	action,
	enabled,
}: {
	ctx: AutumnContext;
	subject?: RuleSubject;
	action?: string;
	enabled?: boolean;
}): Promise<ApprovalRule[]> => {
	const rows = await approvalRuleRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: AppEnv.Live,
		action,
		enabled,
		subjects: subject ? [ruleSubjectToRow({ subject })] : undefined,
	});
	return toApprovalRules({ db: ctx.db, rows });
};
