import type { BillingContext, FullCusProduct, LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRefundLineItems } from "./getRefundLineItems";

export const getRefundLineItemForPrice = ({
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
}): LineItem | undefined => {
	const matchedRefundLineItems = getRefundLineItems({
		ctx,
		customerProduct,
		billingContext,
	});

	const matchedRefundForPrice = matchedRefundLineItems.find(
		(li) => li.context.price.id === priceId,
	);

	return matchedRefundForPrice ?? catalogFallback;
};
