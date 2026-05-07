import {
	type BillingContext,
	type BillingInterval,
	type BillingPlan,
	type BillingPreviewResponse,
	cp,
	cusProductsToPrices,
	type FullCusProduct,
	getCycleEnd,
	getSmallestInterval,
	hasCustomerProductEnded,
} from "@autumn/shared";
import type { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToUpdatedCustomerProduct } from "@/internal/billing/v2/utils/billingPlan/billingPlanToUpdatedCustomerProduct";
import { billingPlanToNextCycleLineItems } from "./billingPlanToNextCycleLineItems";
import { computeScheduledAnchorResetPreview } from "./computeScheduledAnchorResetPreview";

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

const getScheduledStartPreviewContext = ({
	customerProducts,
	currentCustomerProducts,
	currentEpochMs,
}: {
	customerProducts: FullCusProduct[];
	currentCustomerProducts: FullCusProduct[];
	currentEpochMs: number;
}) => {
	let scheduledStartMs: number | null = null;

	for (const customerProduct of customerProducts) {
		if (!cp(customerProduct).scheduled().valid) continue;
		if (customerProduct.starts_at <= currentEpochMs) continue;

		scheduledStartMs =
			scheduledStartMs === null
				? customerProduct.starts_at
				: Math.min(scheduledStartMs, customerProduct.starts_at);
	}

	const scheduledStartCustomerProducts =
		scheduledStartMs === null
			? []
			: customerProducts.filter(
					(customerProduct) => customerProduct.starts_at === scheduledStartMs,
				);

	const currentPrices = cusProductsToPrices({
		cusProducts: currentCustomerProducts,
		filters: { excludeOneOffPrices: true },
	});
	const scheduledStartPrices = cusProductsToPrices({
		cusProducts: scheduledStartCustomerProducts,
		filters: { excludeOneOffPrices: true },
	});

	return {
		scheduledStartMs,
		scheduledStartCustomerProducts,
		smallestInterval: getSmallestInterval({
			prices: currentPrices.length > 0 ? currentPrices : scheduledStartPrices,
		}),
	};
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

	const {
		scheduledStartMs,
		scheduledStartCustomerProducts,
		smallestInterval,
	} = getScheduledStartPreviewContext({
		customerProducts,
		currentCustomerProducts,
		currentEpochMs: billingContext.currentEpochMs,
	});

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

	if (billingCycleAnchorMs === "now" && scheduledStartMs === null) {
		return {
			nextCycle: undefined,
			debug: {
				...baseDebug,
				nextCycleStart: null,
				filteredCustomerProducts: [],
			},
		};
	}

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

	const isScheduledAnchorReset =
		typeof billingContext.requestedBillingCycleAnchor === "number";

	let nextCycleStart: number;
	let lineItemsBillingContext: BillingContext = billingContext;
	let prorationRatio: Decimal | undefined;

	if (isScheduledAnchorReset) {
		const result = computeScheduledAnchorResetPreview({
			billingContext,
			interval: smallestInterval.interval as BillingInterval,
			intervalCount: smallestInterval.intervalCount,
		});
		nextCycleStart = result.nextCycleStart;
		prorationRatio = result.prorationRatio;
		lineItemsBillingContext = result.lineItemsBillingContext;
	} else if (billingCycleAnchorMs === "now" && scheduledStartMs !== null) {
		nextCycleStart = scheduledStartMs;
	} else {
		nextCycleStart = getCycleEnd({
			anchor: anchorMs,
			interval: smallestInterval.interval,
			intervalCount: smallestInterval.intervalCount,
			now: billingContext.currentEpochMs,
			floor: anchorMs,
		});
	}

	const nextCycleCustomerProducts =
		billingCycleAnchorMs === "now" && scheduledStartMs !== null
			? scheduledStartCustomerProducts
			: customerProducts;
	const filteredCustomerProducts = nextCycleCustomerProducts.filter(
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

	let { previewLineItems, previewUsageLineItems, subtotal, total } =
		billingPlanToNextCycleLineItems({
			ctx,
			customerProducts: filteredCustomerProducts,
			autumnBillingPlan: billingPlan.autumn,
			billingContext: lineItemsBillingContext,
			nextCycleStart,
		});

	if (prorationRatio) {
		previewLineItems = previewLineItems.map((item) => ({
			...item,
			subtotal: prorationRatio.mul(item.subtotal).toDecimalPlaces(2).toNumber(),
			total: prorationRatio.mul(item.total).toDecimalPlaces(2).toNumber(),
			discounts: item.discounts?.map((discount) => ({
				...discount,
				amount_off: prorationRatio
					.mul(discount.amount_off)
					.toDecimalPlaces(2)
					.toNumber(),
			})),
		}));
		subtotal = prorationRatio.mul(subtotal).toDecimalPlaces(2).toNumber();
		total = prorationRatio.mul(total).toDecimalPlaces(2).toNumber();
	}

	return {
		nextCycle: {
			starts_at: nextCycleStart,
			subtotal,
			total,
			line_items: previewLineItems,
			usage_line_items: previewUsageLineItems,
		},
		debug: { ...baseDebug, nextCycleStart, filteredCustomerProducts },
	};
};
