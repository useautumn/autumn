import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { logApprovalDecision } from "./logApprovalDecision";

/**
 * Shadow mode: checks a billing write against the org's approval rules and logs
 * the decision, between compute and execute. Never blocks.
 */
export const logBillingApprovalDecision = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** As the action's preview passes it, so facts match that preview. */
	nextCycleStripeSubscriptionId?: string;
}) => {
	const approval = await evaluateBillingApproval({
		ctx,
		billingContext,
		billingPlan,
		action,
		nextCycleStripeSubscriptionId,
	});
	if (!approval) return;

	const { principal, rules, verdict, facts } = approval;
	// Exempt members and members no rule names keep today's checks, so there's nothing to log.
	if (verdict.verdict === "fallback" || !facts) return;

	await logApprovalDecision({
		ctx,
		principal,
		action,
		verdict,
		rules,
		facts: billingFactsToJson({ facts }),
		enforced: false,
	});
};
