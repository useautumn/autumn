import type { LineItem } from "../../../models/billingModels/invoicingModels/lineItem";
import type { LineItemContext } from "../../../models/billingModels/invoicingModels/lineItemContext";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels";
import type { Organization } from "../../../models/orgModels/orgTable";
import { addCusProductToCusEnt } from "../../cusEntUtils/cusEntUtils";
import { cusPriceToCusEnt } from "../../cusPriceUtils/convertCusPriceUtils";
import { orgToCurrency } from "../../orgUtils/convertOrgUtils";
import {
	isConsumablePrice,
	isFixedPrice,
} from "../../productUtils/priceUtils/classifyPriceUtils";
import { getLineItemBillingPeriod } from "../cycleUtils/getLineItemBillingPeriod";
import { fixedPriceToLineItem } from "./lineItemBuilders/fixedPriceToLineItem";
import { usagePriceToLineItem } from "./lineItemBuilders/usagePriceToLineItem";

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
	nowMs,
	billingCycleAnchorMs,
	direction,
	org,
	logger,
}: {
	cusProduct: FullCusProduct;
	nowMs: number;
	billingCycleAnchorMs: number | "now";
	direction: "charge" | "refund";
	org: Organization;
	// biome-ignore lint/suspicious/noExplicitAny: Logger type defined in server package
	logger: any;
}): LineItem[] => {
	let lineItems: LineItem[] = [];

	// logger.debug(
	// 	`Building line items for customer product: ${cusProduct.product.id} (${direction})`,
	// );
	// logger.debug(
	// 	`Billing cycle anchor: ${formatMs(billingCycleAnchorMs)}, now: ${formatMs(nowMs)}`,
	// );

	for (const cusPrice of cusProduct.customer_prices) {
		const price = cusPrice.price;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			anchorMs: billingCycleAnchorMs,
			price,
			nowMs,
		});

		// logger.debug(
		// 	`Billing period: ${formatMs(billingPeriod?.start)} - ${formatMs(billingPeriod?.end)}`,
		// );

		// Build line item context
		const context: LineItemContext = {
			price,
			product: cusProduct.product,
			feature: undefined,

			billingPeriod,
			direction,
			billingTiming: "in_advance",
			now: nowMs,
			currency: orgToCurrency({ org }),
		};

		if (isFixedPrice(price)) {
			lineItems.push(
				fixedPriceToLineItem({
					context,
					quantity: cusProduct.quantity ?? 1,
				}),
			);
			continue;
		}

		if (isConsumablePrice(price)) continue;

		const cusEnt = cusPriceToCusEnt({
			cusPrice,
			cusEnts: cusProduct.customer_entitlements,
		});

		context.feature = cusEnt?.entitlement.feature;

		if (!cusEnt) {
			throw new Error(
				`[cusProductToLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct,
		});

		lineItems.push(
			usagePriceToLineItem({
				cusEnt: cusEntWithCusProduct,
				context,
			}),
		);
	}

	lineItems = lineItems.filter((item) => item.amount !== 0);

	return lineItems;
};
