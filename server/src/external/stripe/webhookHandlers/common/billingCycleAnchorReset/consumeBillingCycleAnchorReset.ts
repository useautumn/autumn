import { isResettingEntitlement, secondsToMs } from "@autumn/shared";
import type { InvoiceCreatedContext } from "@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext";
import type { AutumnBillingPlanBuilder } from "@/internal/billing/v2/utils/billingPlanBuilder/createAutumnBillingPlanBuilder";

export const consumeBillingCycleAnchorReset = ({
	eventContext,
	plan,
}: {
	eventContext: Pick<
		InvoiceCreatedContext,
		| "stripeSubscription"
		| "customerProducts"
		| "billingCycleAnchorResetCustomerProductIds"
	>;
	plan: AutumnBillingPlanBuilder;
}) => {
	const stripeAnchorMs = secondsToMs(
		eventContext.stripeSubscription.billing_cycle_anchor,
	);
	const resetCustomerProductIds = new Set(
		eventContext.billingCycleAnchorResetCustomerProductIds,
	);

	for (const customerProduct of eventContext.customerProducts) {
		if (!resetCustomerProductIds.has(customerProduct.id)) continue;
		plan.updateCustomerProduct({
			customerProduct,
			updates: {
				billing_cycle_anchor: stripeAnchorMs,
				billing_cycle_anchor_resets_at: null,
			},
		});

		// Every resetting row re-phases to the new anchor, not only prepaid ones:
		// usage windows that outlast a row's reset interval anchor to it.
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (
				!isResettingEntitlement({
					entitlement: customerEntitlement.entitlement,
				})
			) {
				continue;
			}
			plan.updateCustomerEntitlement({
				customerEntitlement,
				updates: { reset_cycle_anchor: stripeAnchorMs },
			});
		}
	}
};
