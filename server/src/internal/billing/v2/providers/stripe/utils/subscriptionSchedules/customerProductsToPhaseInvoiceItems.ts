import type { BillingContext, FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeItemSpecToPhaseAddInvoiceItem } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/stripeItemSpecToStripeParam";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";

/**
 * One-off prices (e.g. onboarding fees) for products that START within this
 * phase window, as `add_invoice_items`. Restricting to the starting phase
 * stops a product spanning multiple phases being charged its fee repeatedly.
 *
 * Products with `access_starts_at` set (enable_plan_immediately) already had
 * their one-off fees invoiced immediately, so they're skipped here to avoid a
 * double charge when the schedule activates.
 */
export const customerProductsToPhaseInvoiceItems = ({
	ctx,
	billingContext,
	customerProducts,
	phaseStartMs,
	phaseEndMs,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	phaseStartMs: number;
	phaseEndMs: number | undefined;
}): Stripe.SubscriptionScheduleUpdateParams.Phase.AddInvoiceItem[] => {
	const addInvoiceItems: Stripe.SubscriptionScheduleUpdateParams.Phase.AddInvoiceItem[] =
		[];

	for (const customerProduct of customerProducts) {
		if (customerProduct.access_starts_at != null) continue;

		const productStartsAt = customerProduct.starts_at;
		const startsInThisPhase =
			productStartsAt >= phaseStartMs &&
			(phaseEndMs === undefined || productStartsAt < phaseEndMs);
		if (!startsInThisPhase) continue;

		const { oneOffItems } = customerProductToStripeItemSpecs({
			ctx,
			customerProduct,
			billingContext,
		});

		for (const item of oneOffItems) {
			if (item.quantity !== undefined && item.quantity <= 0) continue;
			addInvoiceItems.push(stripeItemSpecToPhaseAddInvoiceItem({ spec: item }));
		}
	}

	return addInvoiceItems;
};
