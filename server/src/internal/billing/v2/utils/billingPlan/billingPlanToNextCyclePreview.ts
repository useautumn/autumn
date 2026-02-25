import type {
	BillingContext,
	BillingPlan,
	FullCusProduct,
} from "@autumn/shared";
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
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { customerProductToLineItems } from "../lineItems/customerProductToLineItems";
import { lineItemToPreviewLineItem } from "../lineItems/lineItemToPreviewLineItem";

export type NextCyclePreviewDebug = {
	allCustomerProducts: FullCusProduct[];
	currentCustomerProducts: FullCusProduct[];
	smallestInterval: { interval: string; intervalCount: number } | null;
	anchorMs: number;
	nextCycleStart: number | null;
	filteredCustomerProducts: FullCusProduct[];
};

export type NextCyclePreviewResult = {
	nextCycle: BillingPreviewResponse["next_cycle"];
	debug: NextCyclePreviewDebug;
};

export const billingPlanToNextCyclePreview = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): NextCyclePreviewResult => {
	const { billingCycleAnchorMs } = billingContext;

	const updatedCustomerProduct = billingPlanToUpdatedCustomerProduct({
		autumnBillingPlan: billingPlan.autumn,
	});
	const { insertCustomerProducts } = billingPlan.autumn;

	// Get all customer products
	const allCustomerProducts = [
		...insertCustomerProducts,
		...(updatedCustomerProduct ? [updatedCustomerProduct] : []),
	];

	const customerProducts = allCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasRelevantStatus().valid,
	);

	const currentCustomerProducts = allCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasActiveStatus().valid,
	);

	const currentPrices = cusProductsToPrices({
		cusProducts: currentCustomerProducts,
		filters: { excludeOneOffPrices: true },
	});

	const smallestInterval = getSmallestInterval({ prices: currentPrices });

	// Calculate anchor
	const anchorMs =
		billingCycleAnchorMs === "now"
			? billingContext.currentEpochMs
			: billingCycleAnchorMs;

	const baseDebug = {
		allCustomerProducts,
		currentCustomerProducts,
		smallestInterval,
		anchorMs,
	};

	if (billingCycleAnchorMs === "now") {
		return {
			nextCycle: undefined,
			debug: {
				...baseDebug,
				nextCycleStart: null,
				filteredCustomerProducts: [],
			},
		};
	}

	// Return undefined if there's no recurring interval (not a subscription)
	if (!smallestInterval) {
		return {
			nextCycle: undefined,
			debug: {
				...baseDebug,
				nextCycleStart: null,
				filteredCustomerProducts: [],
			},
		};
	}

	// Calculate next cycle start
	const nextCycleStart = getCycleEnd({
		anchor: anchorMs,
		interval: smallestInterval.interval,
		intervalCount: smallestInterval.intervalCount,
		now: billingContext.currentEpochMs,
		floor: anchorMs,
	});

	const filteredCustomerProducts = customerProducts.filter(
		(customerProduct) => {
			return !hasCustomerProductEnded(customerProduct, {
				nowMs: nextCycleStart,
			});
		},
	);

	if (filteredCustomerProducts.length === 0) {
		return {
			nextCycle: undefined,
			debug: { ...baseDebug, nextCycleStart, filteredCustomerProducts },
		};
	}

	const autumnLineItems = filteredCustomerProducts.flatMap((customerProduct) =>
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

	const previewLineItems = autumnLineItems.map(lineItemToPreviewLineItem);
	const total = sumValues(
		autumnLineItems.map((line) => line.amountAfterDiscounts),
	);

	return {
		nextCycle: {
			starts_at: nextCycleStart,
			total,
			line_items: previewLineItems,
		},
		debug: { ...baseDebug, nextCycleStart, filteredCustomerProducts },
	};
};
