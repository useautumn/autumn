import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleUpdateSubscriptionErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUpdateSubscriptionErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import type { MultiUpdateItemResult } from "../compute/computeMultiUpdateFold";
import type { MultiUpdateStripeBillingPlan } from "../evaluate/evaluateMultiUpdateStripe";

/**
 * Per-item gates run against the item's OWN plan with an empty Stripe plan —
 * the subscription-level Stripe plan carries sibling items' artifacts (e.g. an
 * immediate cancel's credit invoice would false-positive the end-of-cycle
 * charge guard). Stripe-level validation then runs once per subscription
 * against that subscription's scoped plan.
 */
export const handleMultiUpdateErrors = async ({
	ctx,
	itemResults,
	stripeBillingPlans,
}: {
	ctx: AutumnContext;
	itemResults: MultiUpdateItemResult[];
	stripeBillingPlans: MultiUpdateStripeBillingPlan[];
}) => {
	for (const itemResult of itemResults) {
		await handleUpdateSubscriptionErrors({
			ctx,
			billingContext: itemResult.billingContext,
			billingPlan: {
				autumn: itemResult.itemPlan,
				stripe: {},
			},
			params: itemResult.params,
		});
	}

	for (const subscriptionPlan of stripeBillingPlans) {
		handleStripeBillingPlanErrors({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
			},
		});
	}
};
