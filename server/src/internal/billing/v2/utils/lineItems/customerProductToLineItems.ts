// TODO: import these once implemented
// import { prepaidPriceToLineItem } from "./lineItemBuilders/prepaidPriceToLineItem";
// import { allocatedPriceToLineItem } from "./lineItemBuilders/allocatedPriceToLineItem";

import {
	addCusProductToCusEnt,
	cusPriceToCusEnt,
	type FullCusProduct,
	fixedPriceToLineItem,
	isConsumablePrice,
	isFixedPrice,
	isOneOffPrice,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/types";
import { getBillingCycleAnchorForDirection } from "@/internal/billing/v2/utils/billingContext/getBillingCycleAnchorForDirection";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

type LineItemDirection = "charge" | "refund";

/**
 * Generates line items for a customer product.
 * - "charge" direction: positive amounts (for NEW product)
 * - "credit" direction: negative amounts with "Unused" prefix (for OLD product)
 *
 * NOTE: Consumable (UsageInArrear) prices are NOT included - they're always
 * positive charges for past usage and handled separately.
 */
export const customerProductToLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	direction,
	priceFilters,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	direction: "charge" | "refund";
	priceFilters?: {
		excludeOneOffPrices?: boolean;
	};
}): LineItem[] => {
	const { billingCycleAnchorMs, currentEpochMs } = billingContext;

	const anchorMs = getBillingCycleAnchorForDirection({
		billingContext,
		direction,
	});

	let lineItems: LineItem[] = [];

	let filteredCustomerPrices = customerProduct.customer_prices;
	if (priceFilters?.excludeOneOffPrices) {
		filteredCustomerPrices = filteredCustomerPrices.filter(
			(cp) => !isOneOffPrice(cp.price),
		);
	}

	for (const cusPrice of filteredCustomerPrices) {
		const price = cusPrice.price;

		// Calculate billing period

		const billingContextForPeriod = {
			...billingContext,
			billingCycleAnchorMs: anchorMs,
		};

		const billingPeriod = getLineItemBillingPeriod({
			billingContext: billingContextForPeriod,
			price,
		});

		// Build line item context
		const context: LineItemContext = {
			price,
			product: customerProduct.product,
			feature: undefined,

			billingPeriod,
			direction,
			billingTiming: "in_advance",
			now: currentEpochMs,
			currency: orgToCurrency({ org: ctx.org }),
		};

		if (isFixedPrice(price)) {
			lineItems.push(
				fixedPriceToLineItem({
					context,
					quantity: customerProduct.quantity ?? 1,
				}),
			);
			continue;
		}

		if (isConsumablePrice(price)) continue;

		const cusEnt = cusPriceToCusEnt({
			cusPrice,
			cusEnts: customerProduct.customer_entitlements,
		});

		context.feature = cusEnt?.entitlement.feature;

		if (!cusEnt) {
			throw new Error(
				`[cusProductToLineItems] No cusEnt found for cusPrice: ${cusPrice.id}`,
			);
		}

		const cusEntWithCusProduct = addCusProductToCusEnt({
			cusEnt,
			cusProduct: customerProduct,
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
