import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "./customerProductToLineItems";
import { getRefundLineItems } from "./getRefundLineItems";

export const getLineItemsForDirection = ({
	ctx,
	customerProduct,
	billingContext,
	direction,
	priceFilters,
	billingCycleAnchorMsOverride,
	atRenewal,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	direction: "charge" | "refund";
	priceFilters?: { excludeOneOffPrices?: boolean };
	billingCycleAnchorMsOverride?: BillingContext["billingCycleAnchorMs"];
	atRenewal?: boolean;
}): LineItem[] => {
	if (direction === "refund") {
		return getRefundLineItems({
			ctx,
			customerProduct,
			billingContext,
			priceFilters,
			billingCycleAnchorMsOverride,
		});
	}

	return customerProductToLineItems({
		ctx,
		customerProduct,
		billingContext,
		direction,
		priceFilters,
		billingCycleAnchorMsOverride,
		atRenewal,
	});
};
