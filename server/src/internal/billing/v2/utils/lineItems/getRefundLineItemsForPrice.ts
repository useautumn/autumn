import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRefundLineItems } from "./getRefundLineItems";

export const getRefundLineItemsForPrice = ({
	ctx,
	customerProduct,
	billingContext,
	priceId,
	catalogFallback,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	priceId: string;
	catalogFallback: LineItem | undefined;
}): LineItem[] => {
	const matchedRefundLineItems = getRefundLineItems({
		ctx,
		customerProduct,
		billingContext,
		includeCatalogFallback: false,
	});

	const matchedRefundsForPrice = matchedRefundLineItems.filter(
		(li) => li.context.price.id === priceId,
	);

	if (matchedRefundsForPrice.length > 0) return matchedRefundsForPrice;

	return catalogFallback ? [catalogFallback] : [];
};
