import {
	AppEnv,
	type ApprovalAction,
	type ApprovalRule,
	type BillingContext,
	type BillingPlan,
} from "@autumn/shared";
import {
	type ApprovalUserPrincipal,
	type ApprovalVerdict,
	type BillingCancelFacts,
	type BillingChangeFacts,
	EXEMPT_ROLES,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToActionFacts } from "@/internal/approvals/facts/billing/billingPlanToActionFacts";
import type { BillingPreviewTotals } from "@/internal/approvals/facts/billing/billingPreviewTotals";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { ctxToApprovalPrincipal } from "./ctxToApprovalPrincipal";
import { listRulesForAction } from "./listRulesForAction";
import { resolveApprovalsEnv } from "./resolveApprovalsEnv";

export type BillingApprovalResult = {
	principal: ApprovalUserPrincipal;
	rules: ApprovalRule[];
	verdict: ApprovalVerdict;
	/** Absent for exempt members, whose verdict needs no facts. */
	facts?: BillingChangeFacts | BillingCancelFacts;
};

/**
 * Checks a billing request against the org's approval rules. Null when no rule
 * applies, so orgs without rules pay one cached read and nothing more.
 */
export const evaluateBillingApproval = async ({
	ctx,
	billingContext,
	billingPlan,
	action,
	preview,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** The preview already built for this plan; built from the plan when absent. */
	preview?: BillingPreviewTotals;
	nextCycleStripeSubscriptionId?: string;
}): Promise<BillingApprovalResult | null> => {
	const principal = ctxToApprovalPrincipal({ ctx });
	if (!principal) return null;

	const env = resolveApprovalsEnv({ ctx });
	if (env !== AppEnv.Live) return null;

	const rules = await listRulesForAction({ ctx, action });
	if (rules.length === 0) return null;

	if (EXEMPT_ROLES.includes(principal.role)) {
		return {
			principal,
			rules,
			verdict: { verdict: "allow", decided_by: null },
		};
	}

	// A write has no preview enrichment yet; facts need its tax and credits to equal the preview.
	const previewBillingPlan =
		billingPlan.preview ??
		(await computeAttachPreviewBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan: billingPlan.autumn,
		}));
	const facts = await billingPlanToActionFacts({
		ctx,
		billingContext,
		billingPlan: { ...billingPlan, preview: previewBillingPlan },
		action,
		preview,
		nextCycleStripeSubscriptionId,
	});
	const verdict = evaluateApprovalRules({
		principal,
		action,
		facts,
		rules,
		env,
	});
	return { principal, rules, verdict, facts };
};
