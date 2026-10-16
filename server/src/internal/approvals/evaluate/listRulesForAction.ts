import type { ApprovalAction, ApprovalRule } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getOrgApprovalRules } from "@/internal/approvals/actions/getOrgApprovalRules";

/** The org's enabled rules covering `action`; empty means the request keeps today's scope check. */
export const listRulesForAction = async ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}): Promise<ApprovalRule[]> => {
	const rules = await getOrgApprovalRules({ ctx });
	return rules.filter((rule) => rule.enabled && rule.actions.includes(action));
};
