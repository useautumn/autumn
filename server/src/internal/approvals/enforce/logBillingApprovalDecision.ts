import {
	type ApprovalAction,
	type BillingContext,
	type BillingPlan,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { logApprovalDecision } from "./logApprovalDecision";

type LogBillingApprovalDecisionParams = {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** As the action's preview passes it, so facts match that preview. */
	nextCycleStripeSubscriptionId?: string;
};

const evaluateAndLogDecision = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	nextCycleStripeSubscriptionId,
}: LogBillingApprovalDecisionParams) => {
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

/**
 * Shadow mode: checks a billing write against the org's approval rules and logs
 * the decision, between compute and execute. Never blocks, even when logging fails.
 */
export const logBillingApprovalDecision = async (
	params: LogBillingApprovalDecisionParams,
) => {
	const { error } = await tryCatch(evaluateAndLogDecision(params));
	if (!error) return;

	params.ctx.logger.error("[approvals] shadow decision not logged", {
		error,
		action: params.action,
	});
};
