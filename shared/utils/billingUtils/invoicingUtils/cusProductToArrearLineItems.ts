import type { LineItem } from "../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels";
import { cusPriceToCusEntWithCusProduct } from "../../cusPriceUtils/convertCusPriceUtils";
import { isConsumablePrice } from "../../productUtils/priceUtils/classifyPriceUtils";
import { getLineItemBillingPeriod } from "../cycleUtils/getLineItemBillingPeriod";
import { consumablePriceToLineItem } from "./lineItemBuilders/consumablePriceToLineItem";

export const cusProductToArrearLineItems = ({
	cusProduct,
	billingCycleAnchor,
	testClockFrozenTime,
}: {
	cusProduct: FullCusProduct;
	billingCycleAnchor: number;
	testClockFrozenTime?: number;
}) => {
	const lineItems: LineItem[] = [];
	const productName = cusProduct.product.name;
	const now = testClockFrozenTime ?? Date.now();

	for (const cusPrice of cusProduct.customer_prices) {
		const price = cusPrice.price;

		if (!isConsumablePrice(price)) continue;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			anchor: billingCycleAnchor,
			price,
			now,
		});

		const cusEnt = cusPriceToCusEntWithCusProduct({
			cusProduct,
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		if (!cusEnt) {
			throw new Error(
				`[cusProductToConsumableLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const context: LineItemContext = {
			productName,
			billingPeriod,
			direction: "charge",
			billingTiming: "in_arrear",
			now,
		};

		lineItems.push(consumablePriceToLineItem({ cusEnt, context }));
	}

	console.log(
		`arrear line items: `,
		lineItems.map((item) => ({
			amount: item.amount,
			description: item.description,
		})),
	);

	return lineItems;
};
