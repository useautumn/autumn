import { filterCustomerProductsByStripeSubscriptionId } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { findBillingCycleAnchorResetCustomerProductIds } from "../../common/billingCycleAnchorReset/findBillingCycleAnchorResetCustomerProductIds";
import { planBillingCycleAnchorReset } from "../../common/billingCycleAnchorReset/planBillingCycleAnchorReset";
import { trackCustomerProductUpdate } from "../../common/trackCustomerProductUpdate";
import { isUninvoicedBillingCycleAnchorMove } from "../isUninvoicedBillingCycleAnchorMove";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

/** Under proration_behavior none Stripe moves the anchor without an invoice, so invoice.created never sees the reset. */
export const planUninvoicedBillingCycleAnchorReset = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}) => {
	if (
		!isUninvoicedBillingCycleAnchorMove({
			subscriptionUpdatedContext: eventContext,
		})
	) {
		return;
	}

	const { stripeSubscription, fullCustomer } = eventContext;
	const customerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: eventContext.customerProducts,
		stripeSubscriptionId: stripeSubscription.id,
	});
	const billingCycleAnchorResetCustomerProductIds =
		findBillingCycleAnchorResetCustomerProductIds({
			stripeSubscription,
			customerProducts,
		});
	if (billingCycleAnchorResetCustomerProductIds.length === 0) return;

	const plan = createAutumnBillingPlanBuilder({
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});
	planBillingCycleAnchorReset({
		ctx,
		eventContext: {
			stripeSubscription,
			stripeSubscriptionId: stripeSubscription.id,
			fullCustomer,
			customerProducts,
			billingCycleAnchorResetCustomerProductIds,
			nowMs: eventContext.nowMs,
		},
		plan,
	});
	const autumnBillingPlan = plan.build();
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	for (const {
		customerProduct,
		updates,
	} of autumnBillingPlan.updateCustomerProducts ?? []) {
		trackCustomerProductUpdate({ eventContext, customerProduct, updates });
	}
};
