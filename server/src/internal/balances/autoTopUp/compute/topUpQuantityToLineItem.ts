import {
	buildLineItem,
	cusEntToCusPrice,
	cusEntToStripeIds,
	type FullCusEntWithFullCusProduct,
	type LineItem,
	type LineItemContext,
	priceToLineAmount,
	usagePriceToLineDescription,
} from "@autumn/shared";

/** Price a top-up by its quantity alone: the charge never reads the
 * feature-keyed options entry, which a sibling recurring prepaid may own. */
export const topUpQuantityToLineItem = ({
	cusEnt,
	quantity,
	context,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	quantity: number;
	context: LineItemContext;
}): LineItem => {
	const cusPrice = cusEntToCusPrice({ cusEnt, errorOnNotFound: true });

	const lineItemContext: LineItemContext = {
		...context,
		price: cusPrice.price,
		feature: cusEnt.entitlement.feature,
		customerProduct: cusEnt.customer_product ?? undefined,
		customerEntitlement: cusEnt,
	};

	return buildLineItem({
		context: lineItemContext,
		amount: priceToLineAmount({
			price: cusPrice.price,
			overage: quantity,
			currency: context.currency,
		}),
		description: usagePriceToLineDescription({
			usage: quantity,
			context: lineItemContext,
		}),
		...cusEntToStripeIds({ cusEnt, currency: context.currency }),
		shouldProrate: false,
		chargeImmediately: true,
		usage: quantity,
		overage: quantity,
	});
};
