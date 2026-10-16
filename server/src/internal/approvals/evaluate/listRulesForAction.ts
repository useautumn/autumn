import type { ApprovalAction, ApprovalRule } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getOrgApprovalRules } from "@/internal/approvals/actions/getOrgApprovalRules";

/** The org's enabled rules covering this action, in list order. */
export const listRulesForAction = async ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}): Promise<ApprovalRule[]> => {
	const rules = await getOrgApprovalRules({ ctx });
	return rules.filter((rule) => rule.actions.includes(action));
};
