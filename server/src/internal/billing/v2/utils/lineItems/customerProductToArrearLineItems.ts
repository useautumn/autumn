import {
	cusPriceToCusEntWithCusProduct,
	type FullCusProduct,
	isConsumablePrice,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "../../billingContext";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

export const customerProductToArrearLineItems = ({
	ctx,
	customerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
}) => {
	let lineItems: LineItem[] = [];

	for (const cusPrice of customerProduct.customer_prices) {
		const price = cusPrice.price;

		if (!isConsumablePrice(price)) continue;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			billingContext,
			price,
		});

		const cusEnt = cusPriceToCusEntWithCusProduct({
			cusProduct: customerProduct,
			cusPrice,
			cusEnts: customerProduct.customer_entitlements,
		});

		if (!cusEnt) {
			throw new Error(
				`[customerProductToArrearLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const context: LineItemContext = {
			price,
			product: customerProduct.product,
			feature: cusEnt.entitlement.feature,

			billingPeriod,
			direction: "charge",
			billingTiming: "in_arrear",
			now: billingContext.currentEpochMs,
			currency: orgToCurrency({ org: ctx.org }),
		};

		lineItems.push(usagePriceToLineItem({ cusEnt, context }));
	}

	lineItems = lineItems.filter((item) => item.amount !== 0);

	return lineItems;
};
