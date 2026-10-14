import {
	type BillingContext,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeItemSpecToPhaseAddInvoiceItem } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/stripeItemSpecToStripeParam";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";

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

	const taxRates = billingContext.taxRateId
		? [billingContext.taxRateId]
		: undefined;

	for (const customerProduct of customerProducts) {
		const productStartsAt = customerProduct.starts_at;
		if (
			customerProduct.status === CusProductStatus.Active &&
			productStartsAt <= billingContext.currentEpochMs
		)
			continue;

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
			const addInvoiceItem = stripeItemSpecToPhaseAddInvoiceItem({
				spec: item,
			});
			addInvoiceItems.push(
				taxRates ? { ...addInvoiceItem, tax_rates: taxRates } : addInvoiceItem,
			);
		}
	}

	return addInvoiceItems;
};
