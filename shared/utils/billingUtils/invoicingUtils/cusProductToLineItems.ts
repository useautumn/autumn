import type { LineItem } from "../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels";
import { addCusProductToCusEnt } from "../../cusEntUtils/cusEntUtils";
import { cusPriceToCusEnt } from "../../cusPriceUtils/convertCusPriceUtils";
import { isPrepaidPrice } from "../../productUtils/priceUtils";
import {
	isAllocatedPrice,
	isFixedPrice,
} from "../../productUtils/priceUtils/classifyPriceUtils";
import { getLineItemBillingPeriod } from "../cycleUtils/getLineItemBillingPeriod";
import { consumablePriceToLineItem } from "./lineItemBuilders/consumablePriceToLineItem";
import { fixedPriceToLineItem } from "./lineItemBuilders/fixedPriceToLineItem";
import { prepaidPriceToLineItem } from "./lineItemBuilders/prepaidPriceToLineItem";

// TODO: import these once implemented
// import { prepaidPriceToLineItem } from "./lineItemBuilders/prepaidPriceToLineItem";
// import { allocatedPriceToLineItem } from "./lineItemBuilders/allocatedPriceToLineItem";

export type LineItemDirection = "charge" | "refund";

/**
 * Generates line items for a customer product.
 * - "charge" direction: positive amounts (for NEW product)
 * - "credit" direction: negative amounts with "Unused" prefix (for OLD product)
 *
 * NOTE: Consumable (UsageInArrear) prices are NOT included - they're always
 * positive charges for past usage and handled separately.
 */
export const cusProductToLineItems = ({
	cusProduct,
	testClockFrozenTime,
	billingCycleAnchor,
	direction,
}: {
	cusProduct: FullCusProduct;
	testClockFrozenTime?: number;
	billingCycleAnchor: number;
	direction: "charge" | "refund";
}): LineItem[] => {
	const lineItems: LineItem[] = [];
	const productName = cusProduct.product.name;

	const now = testClockFrozenTime ?? Date.now();

	for (const cusPrice of cusProduct.customer_prices) {
		const price = cusPrice.price;

		const { interval, interval_count: intervalCount } = price.config;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			anchor: billingCycleAnchor,
			price,
			now,
		});

		// Build line item context
		const context: LineItemContext = {
			productName,
			billingPeriod,
			direction,
			billingTiming: "in_advance",
			now,
		};

		if (isFixedPrice(price)) {
			lineItems.push(
				fixedPriceToLineItem({
					price,
					context,
					quantity: cusProduct.quantity ?? 1,
				}),
			);
			continue;
		}

		const cusEnt = cusPriceToCusEnt({
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		if (!cusEnt) {
			throw new Error(
				`[cusProductToLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		if (isPrepaidPrice({ price })) {
			lineItems.push(
				prepaidPriceToLineItem({
					cusEnt: cusEntWithCusProduct,
					context,
				}),
			);
		}

		if (isAllocatedPrice(price)) {
			lineItems.push(
				consumablePriceToLineItem({
					cusEnt: cusEntWithCusProduct,
					context,
				}),
			);
		}

		// if (isFixedPrice(price)) {
		// 	item = fixedPriceToLineItem({
		// 		price,
		// 		productName,
		// 		currency,
		// 		billingPeriod,
		// 		now,
		// 		quantity: cusProduct.quantity ?? 1,
		// 	});
		// }

		// TODO: Add prepaid and allocated once implemented
		// if (isPrepaidPrice(price)) {
		//   const cusEnt = findCusEntForPrice({ cusProduct, price });
		//   const overage = cusEntToTotalOverage({ cusEnt });
		//   item = prepaidPriceToLineItem({ price, overage, billingPeriod });
		// }

		// if (isAllocatedPrice(price)) {
		//   const cusEnt = findCusEntForPrice({ cusProduct, price });
		//   const quantity = cusEnt?.balance ?? 0;
		//   item = allocatedPriceToLineItem({ price, quantity, billingPeriod });
		// }

		// if (item) {
		// 	// Negate amount for credits (OLD product)
		// 	if (direction === "credit") {
		// 		item = lineItemToCredit(item);
		// 	}
		// 	lineItems.push(item);
		// }
	}

	console.log(
		"Line items:",
		lineItems.map((item) => ({
			amount: item.amount,
			description: item.description,
		})),
	);

	return lineItems;
};
