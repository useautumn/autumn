import {
	ACTIONS,
	AppEnv,
	type ApprovalAction,
	checkScopes,
} from "@autumn/shared";
import { EXEMPT_ROLES } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { memberRulesGrantAction } from "@/internal/approvals/enforce/access/memberRulesGrantAction";
import { resolveApprovalsEnv } from "@/internal/approvals/evaluate/resolveApprovalsEnv";

export type ApprovalCan = {
	can: boolean;
	reason: "rule" | "scope" | "exempt" | "none";
};

/**
 * Whether this member's request for `action` would be let in: exempt, decided
 * by rules (enforced orgs only, since shadow mode grants nothing), or by scope.
 */
export const resolveApprovalCan = async ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}): Promise<ApprovalCan> => {
	const isExempt =
		resolveApprovalsEnv({ ctx }) !== AppEnv.Live ||
		EXEMPT_ROLES.includes(ctx.role ?? "");
	if (isExempt) return { can: true, reason: "exempt" };

	if (await memberRulesGrantAction({ ctx, action })) {
		return { can: true, reason: "rule" };
	}

	const hasScope = checkScopes([ACTIONS[action].scope], ctx.scopes).allowed;
	if (hasScope) return { can: true, reason: "scope" };

	return { can: false, reason: "none" };
};
