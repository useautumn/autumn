import {
	cusPriceToCusEntWithCusProduct,
	cusProductToPrices,
	EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	getCycleEnd,
	isConsumablePrice,
	isV4Usage,
	type LineItem,
	type LineItemContext,
	orgToCurrency,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateCustomerEntitlement } from "@/internal/billing/v2/types/autumnBillingPlan";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import type { BillingContext } from "../../billingContext";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

export const customerProductToArrearLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	filters,
	updateNextResetAt,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	filters: {
		onlyV4Usage?: boolean;
		/** Optional filter to skip specific entitlements (e.g., for multi-interval billing) */
		cusEntFilter?: (cusEnt: FullCusEntWithFullCusProduct) => boolean;
	};
	updateNextResetAt: boolean;
}): {
	lineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
} => {
	const lineItems: LineItem[] = [];

	let filteredPrices = cusProductToPrices({ cusProduct: customerProduct });

	if (filters.onlyV4Usage) {
		filteredPrices = filteredPrices.filter((price) =>
			isV4Usage({ price, cusProduct: customerProduct }),
		);
	}

	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];

	// If is trialing, or trial just ended, skip this...?

	for (const cusPrice of customerProduct.customer_prices) {
		const price = cusPrice.price;

		if (!isConsumablePrice(price)) continue;

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

		// Apply optional filter (e.g., for multi-interval billing check)
		if (filters.cusEntFilter && !filters.cusEntFilter(cusEnt)) continue;

		// Calculate billing period
		const billingPeriod = getLineItemBillingPeriod({
			billingContext,
			price,
		});

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

		const lineItem = usagePriceToLineItem({
			cusEnt,
			context,
			options: { includePeriodDescription: false },
		});

		// Only include line items with non-zero amounts
		if (lineItem.amount !== 0) {
			lineItems.push(lineItem);
		}

		// Update to make to customer entitlement.
		const resetBalancesUpdate = getResetBalancesUpdate({
			cusEnt,
			allowance: cusEnt.entitlement.allowance ?? 0,
		});

		const nextResetAt = getCycleEnd({
			anchor: billingContext.billingCycleAnchorMs,
			interval: cusEnt.entitlement.interval ?? EntInterval.Month,
			intervalCount: cusEnt.entitlement.interval_count,
			now: billingPeriod?.end ?? billingContext.currentEpochMs,
		});

		updateCustomerEntitlements.push({
			customerEntitlement: cusEnt,
			updates: {
				...resetBalancesUpdate,
				next_reset_at: updateNextResetAt ? nextResetAt : undefined,
			},
		});
	}

	return { lineItems, updateCustomerEntitlements };
};
