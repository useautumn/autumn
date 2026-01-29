import {
	type BillingPreviewResponse,
	cp,
	cusProductsToPrices,
	getCycleEnd,
	getSmallestInterval,
	hasCustomerProductEnded,
	sumValues,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext, BillingPlan } from "@autumn/shared";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { customerProductToLineItems } from "../lineItems/customerProductToLineItems";

export const billingPlanToNextCyclePreview = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): BillingPreviewResponse["next_cycle"] => {
	// 1. Return undefined if billing cycle anchor is now
	const { billingCycleAnchorMs } = billingContext;

	if (billingCycleAnchorMs === "now") return undefined;

	const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
		autumnBillingPlan: billingPlan.autumn,
	});
	const { insertCustomerProducts } = billingPlan.autumn;

	// 2. Get cycle end and if none, return undefined
	const allCustomerProducts = [
		...insertCustomerProducts,
		...(updatedCustomerProduct ? [updatedCustomerProduct] : []),
	];

	let customerProducts = allCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasActiveStatus().valid,
	);

	const prices = cusProductsToPrices({
		cusProducts: customerProducts,
		filters: { excludeOneOffPrices: true },
	});

	const smallestInterval = getSmallestInterval({ prices });

	if (!smallestInterval) return undefined;

	const nextCycleStart = getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
		now: billingContext.currentEpochMs,
		floor: billingCycleAnchorMs,
	});

	customerProducts = customerProducts.filter((customerProduct) => {
		return !hasCustomerProductEnded(customerProduct, {
			nowMs: nextCycleStart,
		});
	});

	if (customerProducts.length === 0) return undefined;

	const autumnLineItems = customerProducts.flatMap((customerProduct) =>
		customerProductToLineItems({
			ctx,
			customerProduct: customerProduct,
			billingContext: {
				...billingContext,
				currentEpochMs: nextCycleStart,
			},
			direction: "charge",
		}),
	);

	const total = sumValues(autumnLineItems.map((line) => line.finalAmount));

	return {
		starts_at: nextCycleStart,
		total,
	};
};
