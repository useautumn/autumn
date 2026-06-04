import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "./customerProductToLineItems";
import { invoiceCreditFromStoredLineItems } from "./invoiceCreditFromStoredLineItems";

export const getRefundLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	priceFilters,
	billingCycleAnchorMsOverride,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	priceFilters?: { excludeOneOffPrices?: boolean };
	billingCycleAnchorMsOverride?: BillingContext["billingCycleAnchorMs"];
}): LineItem[] => {
	const { lineItems: matchedCredits, allPricesResolved } =
		invoiceCreditFromStoredLineItems({
			ctx,
			customerProduct,
			billingContext,
		});

	if (allPricesResolved) return matchedCredits;

	const catalogCredits = customerProductToLineItems({
		ctx,
		customerProduct,
		billingContext,
		direction: "refund",
		priceFilters,
		billingCycleAnchorMsOverride,
	});

	return [...matchedCredits, ...catalogCredits];
};
