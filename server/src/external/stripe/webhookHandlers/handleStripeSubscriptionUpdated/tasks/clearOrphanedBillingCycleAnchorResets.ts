import { isCustomerProductOnStripeSubscription } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { createAutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";
import { isOrphanedBillingCycleAnchorReset } from "../../common/billingCycleAnchorReset/isOrphanedBillingCycleAnchorReset";
import { planOrphanedBillingCycleAnchorReset } from "../../common/billingCycleAnchorReset/planOrphanedBillingCycleAnchorReset";
import { trackCustomerProductUpdate } from "../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

/** A schedule released or swapped before its anchor takes the pending reset with it, so Autumn drops it too. */
export const clearOrphanedBillingCycleAnchorResets = async ({
	ctx,
	eventContext,
}: {
	ctx: StripeWebhookContext;
	eventContext: StripeSubscriptionUpdatedContext;
}) => {
	const { previousAttributes, stripeSubscription, fullCustomer, nowMs } =
		eventContext;
	if (previousAttributes?.schedule === undefined) return;

	const orphanedCustomerProducts = eventContext.customerProducts.filter(
		(customerProduct) =>
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId: stripeSubscription.id,
			}) === true &&
			isOrphanedBillingCycleAnchorReset({
				customerProduct,
				stripeSubscription,
				nowMs,
			}),
	);
	if (orphanedCustomerProducts.length === 0) return;

	const plan = createAutumnBillingPlanBuilder({
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});
	for (const customerProduct of orphanedCustomerProducts) {
		planOrphanedBillingCycleAnchorReset({ customerProduct, nowMs, plan });
	}
	const autumnBillingPlan = plan.build();
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });

	for (const {
		customerProduct,
		updates,
	} of autumnBillingPlan.updateCustomerProducts ?? []) {
		trackCustomerProductUpdate({ eventContext, customerProduct, updates });
	}
};
