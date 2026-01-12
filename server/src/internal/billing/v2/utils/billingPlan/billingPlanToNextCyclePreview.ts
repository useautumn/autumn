import {
	type BillingPreviewResponse,
	cp,
	cusProductsToPrices,
	cusProductToLineItems,
	getCycleEnd,
	getSmallestInterval,
	sumValues,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

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

	ctx.logger.info(`billingCycleAnchorMs: ${billingCycleAnchorMs}`);

	ctx.logger.info(`billingCycleAnchorMs: ${billingCycleAnchorMs}`);

	if (billingCycleAnchorMs === "now") return undefined;
	const { insertCustomerProducts, updateCustomerProduct } = billingPlan.autumn;

	// 2. Get cycle end and if none, return undefined
	const allCustomerProducts = [
		...insertCustomerProducts,
		...(updateCustomerProduct ? [updateCustomerProduct] : []),
	];
	const customerProducts = allCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasActiveStatus().valid,
	);

	const prices = cusProductsToPrices({ cusProducts: customerProducts });

	const smallestInterval = getSmallestInterval({ prices });

	if (!smallestInterval) return undefined;

	const nextCycleStart = getCycleEnd({
		anchor: billingCycleAnchorMs,
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
		now: billingContext.currentEpochMs,
	});

	const autumnLineItems = customerProducts.flatMap((customerProduct) =>
		cusProductToLineItems({
			cusProduct: customerProduct,
			nowMs: nextCycleStart,
			billingCycleAnchorMs,
			direction: "charge",
			org: ctx.org,
			logger: ctx.logger,
		}),
	);

	const total = sumValues(autumnLineItems.map((line) => line.finalAmount));

	return {
		starts_at: nextCycleStart,
		total,
	};
};
