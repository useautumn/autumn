import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import { billingContextToUpdateAction } from "@/internal/approvals/facts/billing/billingContextToUpdateAction";

type MultiUpdateItem = {
	billingContext: BillingContext;
	itemPlan: BillingPlan["autumn"];
};

/**
 * One approval check per multi-update item, on that item's own plan and action,
 * so mixed cancels and updates in one subscription are each judged on their own.
 */
export const itemsToApprovalChecks = ({
	itemResults,
}: {
	itemResults: MultiUpdateItem[];
}): {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: ApprovalAction;
	nextCycleStripeSubscriptionId?: string;
}[] =>
	itemResults.map(({ billingContext, itemPlan }) => ({
		billingContext,
		billingPlan: { autumn: itemPlan, stripe: {} },
		action: billingContextToUpdateAction({ billingContext }),
		nextCycleStripeSubscriptionId: billingContext.stripeSubscription?.id,
	}));
