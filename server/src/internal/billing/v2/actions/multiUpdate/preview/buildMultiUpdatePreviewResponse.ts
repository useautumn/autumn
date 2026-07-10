import {
	isCustomerProductOnStripeSubscription,
	type MultiUpdatePreviewResponseV0,
	type MultiUpdateSubscriptionPreviewV0,
	orgToCurrency,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import type { MultiUpdateStripeBillingPlan } from "../evaluate/evaluateMultiUpdateStripe";

/**
 * Composes one CORE billing preview per subscription group — each built by the
 * same builders single-update previews use, from that group's sub-scoped plan
 * and context (own anchor, own tax inheritance) — and sums the totals.
 */
export const buildMultiUpdatePreviewResponse = async ({
	ctx,
	customerId,
	stripeBillingPlans,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeBillingPlans: MultiUpdateStripeBillingPlan[];
}): Promise<MultiUpdatePreviewResponseV0> => {
	const subscriptions: MultiUpdateSubscriptionPreviewV0[] = [];

	for (const subscriptionPlan of stripeBillingPlans) {
		const preview = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			autumnBillingPlan: subscriptionPlan.autumnBillingPlan,
		});

		const basePreview = await billingPlanToPreviewResponse({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
				preview,
			},
			nextCycleCustomerProductFilter: (customerProduct) =>
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: subscriptionPlan.subscriptionId,
				}) === true,
		});

		subscriptions.push({
			...basePreview,
			plan_ids: subscriptionPlan.planIds,
		});
	}

	const total = subscriptions
		.reduce((sum, subscription) => sum.add(subscription.total), new Decimal(0))
		.toDP(2)
		.toNumber();

	return {
		object: "multi_update_preview",
		customer_id: customerId,
		currency: orgToCurrency({ org: ctx.org }),
		total,
		subscriptions,
	};
};
