import {
	type ApprovalAction,
	type BillingContext,
	type BillingPlan,
	PermissionDeniedError,
	tryCatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { logApprovalDecision } from "./logApprovalDecision";

type CheckBillingApprovalParams = {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** As the action's preview passes it, so facts match that preview. */
	nextCycleStripeSubscriptionId?: string;
};

const decideBillingApproval = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	nextCycleStripeSubscriptionId,
	enforced,
}: CheckBillingApprovalParams & { enforced: boolean }) => {
	const approval = await evaluateBillingApproval({
		ctx,
		billingContext,
		billingPlan,
		action,
		nextCycleStripeSubscriptionId,
	});
	if (!approval) return;

	const { principal, rules, verdict, facts } = approval;
	// Exempt members and members no rule names keep today's checks, so there's nothing to decide.
	if (verdict.verdict === "fallback" || !facts) return;

	await logApprovalDecision({
		ctx,
		principal,
		action,
		verdict,
		rules,
		facts: billingFactsToJson({ facts }),
		enforced,
	});

	if (!enforced || verdict.verdict === "allow") return;
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
