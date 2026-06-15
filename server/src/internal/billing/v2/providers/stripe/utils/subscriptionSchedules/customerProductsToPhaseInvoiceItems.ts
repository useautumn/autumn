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
 * One-off fees on a future-dated attach are always billed when the plan
 * activates (never up front), so they live on the activating phase here.
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
