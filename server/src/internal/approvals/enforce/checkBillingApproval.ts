import {
	type ApprovalAction,
	type BillingContext,
	type BillingPlan,
	PermissionDeniedError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { resolveApprovalPrincipal } from "@/internal/approvals/evaluate/resolveApprovalPrincipal";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { rejectRuleAdmittedRequest } from "./access/rejectRuleAdmittedRequest";
import { logApprovalDecision } from "./logApprovalDecision";
import { setupApprovalTaxRate } from "./setupApprovalTaxRate";

type CheckBillingApprovalParams = {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** As the action's preview passes it, so facts match that preview. */
	nextCycleStripeSubscriptionId?: string;
	/** False for a pre-check whose write is checked again; it then logs only a deny it blocks. */
	logDecision?: boolean;
};

const decideBillingApproval = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	nextCycleStripeSubscriptionId,
	logDecision = true,
	enforced,
}: CheckBillingApprovalParams & { enforced: boolean }) => {
	const rulesMayApply =
		(await resolveApprovalPrincipal({ ctx })) !== null &&
		(await listRulesForAction({ ctx, action })).length > 0;
	const approval = await evaluateBillingApproval({
		ctx,
		billingContext: rulesMayApply
			? await setupApprovalTaxRate({ ctx, billingContext })
			: billingContext,
		billingPlan,
		action,
		nextCycleStripeSubscriptionId,
	});
	const rulesDecide =
		approval !== null && approval.verdict.verdict !== "fallback";
	if (!rulesDecide) rejectRuleAdmittedRequest({ ctx, action });
	if (!approval) return;

	const { principal, rules, verdict, facts } = approval;
	// Exempt members and members no rule names keep today's checks, so there's nothing to log.
	if (verdict.verdict === "fallback" || !facts) return;

	// A pre-check that blocks is the last check, so its deny is the one logged.
	const blocks = enforced && verdict.verdict === "deny";
	if (logDecision || blocks) {
		await logApprovalDecision({
			ctx,
			principal,
			action,
			verdict,
			rules,
			facts: billingFactsToJson({ facts }),
			enforced,
		});
	}

	if (!blocks) return;
	throw new PermissionDeniedError({
		message: verdict.message,
		violations: verdict.violations,
		decided_by: verdict.decided_by,
		allowed_roles: verdict.allowed_roles,
	});
};

/**
 * Checks a billing write against the org's approval rules, between compute and
 * execute, and logs the decision. Only orgs with `approvals_enforced` are blocked.
 */
export const checkBillingApproval = async (
	params: CheckBillingApprovalParams,
) => {
	const enforced = params.ctx.org.config?.approvals_enforced === true;
	if (enforced) return decideBillingApproval({ ...params, enforced });

	// Shadow mode never stops the write, even when logging fails.
	const { error } = await tryCatch(
		decideBillingApproval({ ...params, enforced }),
	);
	if (!error) return;
	params.ctx.logger.error("[approvals] shadow decision not logged", {
		error,
		action: params.action,
	});
};
