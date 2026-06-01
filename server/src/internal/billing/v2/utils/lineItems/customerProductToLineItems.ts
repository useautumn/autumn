// TODO: import these once implemented
// import { prepaidPriceToLineItem } from "./lineItemBuilders/prepaidPriceToLineItem";
// import { allocatedPriceToLineItem } from "./lineItemBuilders/allocatedPriceToLineItem";

import type { BillingContext } from "@autumn/shared";
import {
	addCusProductToCusEnt,
	cusPriceToCusEnt,
	customerProductToEntity,
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
import { getBillingCycleAnchorForDirection } from "@/internal/billing/v2/utils/billingContext/getBillingCycleAnchorForDirection";
import { augmentBillingContextForAnchorResetRefund } from "./augmentBillingContextForAnchorResetRefund";
import { getBackdatedLineItemContext } from "./getBackdatedLineItemContext";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

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
	billingCycleAnchorMsOverride,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	direction: "charge" | "refund";
	priceFilters?: {
		excludeOneOffPrices?: boolean;
	};
	billingCycleAnchorMsOverride?: BillingContext["billingCycleAnchorMs"];
}): LineItem[] => {
	const { currentEpochMs } = billingContext;

	const anchorMs =
		billingCycleAnchorMsOverride ??
		getBillingCycleAnchorForDirection({
			billingContext,
			direction,
		});

	const lineItems: LineItem[] = [];
	const entity = customerProductToEntity({
		customerProduct,
		entities: billingContext.fullCustomer.entities,
	});

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

		let effectiveNow = currentEpochMs;

		if (direction === "refund" && billingPeriod) {
			const action = augmentBillingContextForAnchorResetRefund({
				currentEpochMs,
				billingPeriod,
				anchorResetRefund: billingContext.anchorResetRefund,
			});

			if (action.type === "skip") continue;
			if (action.type === "use_snapped_now") effectiveNow = action.snappedNow;
		}

		const backdatedLineItemContext = getBackdatedLineItemContext({
			price,
			billingContext: billingContextForPeriod,
			billingPeriod,
			direction,
			billingTiming: "in_advance",
		});
		if (backdatedLineItemContext) effectiveNow = backdatedLineItemContext.now;

		// Build line item context
		const context: LineItemContext = {
			price,
			product: customerProduct.product,
			feature: undefined,

			billingPeriod,
			direction,
			billingTiming: "in_advance",
			now: effectiveNow,
			currency: orgToCurrency({ org: ctx.org }),
			entity,
			customerProduct,
			customerPrice: cusPrice,
			effectivePeriod: backdatedLineItemContext?.effectivePeriod,
			backdate: backdatedLineItemContext?.backdate,
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

	// lineItems = lineItems.filter((item) => item.amount !== 0);

	return lineItems;
};
