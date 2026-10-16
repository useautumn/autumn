import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateBillingApproval } from "@/internal/approvals/evaluate/evaluateBillingApproval";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { resolveApprovalPrincipal } from "@/internal/approvals/evaluate/resolveApprovalPrincipal";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";
import { checkApproval } from "./checkApproval";
import { setupApprovalTaxRate } from "./setupApprovalTaxRate";

/** A billing write's approval check, between compute and execute. */
export const checkBillingApproval = ({
	ctx,
	billingContext,
	billingPlan,
	action,
	nextCycleStripeSubscriptionId,
	logDecision,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	/** As the action's preview passes it, so facts match that preview. */
	nextCycleStripeSubscriptionId?: string;
	/** False for a pre-check whose write is checked again; it then logs only a deny it blocks. */
	logDecision?: boolean;
}) =>
	checkApproval({
		ctx,
		action,
		logDecision,
		factsToJson: billingFactsToJson,
		evaluate: async () => {
			// Only load a manual tax rate when rules may apply, so orgs without rules pay nothing.
			const rulesMayApply =
				(await resolveApprovalPrincipal({ ctx })) !== null &&
				(await listRulesForAction({ ctx, action })).length > 0;
			return evaluateBillingApproval({
				ctx,
				billingContext: rulesMayApply
					? await setupApprovalTaxRate({ ctx, billingContext })
					: billingContext,
				billingPlan,
				action,
				nextCycleStripeSubscriptionId,
			});
		},
	});
