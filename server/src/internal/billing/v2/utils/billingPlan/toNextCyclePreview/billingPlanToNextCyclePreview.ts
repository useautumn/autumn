import {
	type BillingContext,
	type BillingPlan,
	type BillingPreviewResponse,
	cp,
	type FullCusProduct,
	hasCustomerProductEnded,
	hasCustomerProductStarted,
} from "@autumn/shared";
import type { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { billingPlanToNextCycleLineItems } from "./billingPlanToNextCycleLineItems";
import { computeScheduledAnchorResetPreview } from "./computeScheduledAnchorResetPreview";
import {
	getActiveCustomerProductsAt,
	getNextCycleEvent,
	type SmallestInterval,
} from "./getNextCycleEvent";

export type NextCyclePreviewDebug = {
	allCustomerProducts: FullCusProduct[];
	currentCustomerProducts: FullCusProduct[];
	smallestInterval: SmallestInterval | null;
	anchorMs: number;
	nextCycleStart: number | null;
	filteredCustomerProducts: FullCusProduct[];
};

export type NextCyclePreviewResult = {
	nextCycle: BillingPreviewResponse["next_cycle"];
	debug: NextCyclePreviewDebug;
};

const MS_PER_SECOND = 1000;

const filterCustomerProductsForEventStart = ({
	customerProducts,
	nextCycleStart,
}: {
	customerProducts: FullCusProduct[];
	nextCycleStart: number;
}) =>
	customerProducts.filter(
		(customerProduct) =>
			customerProduct.starts_at <= nextCycleStart &&
			!hasCustomerProductEnded(customerProduct, { nowMs: nextCycleStart }),
	);

const scaleNextCycleAmounts = ({
	lineItemsResult,
	prorationRatio,
}: {
	lineItemsResult: ReturnType<typeof billingPlanToNextCycleLineItems>;
	prorationRatio: Decimal;
}) => {
	const previewLineItems = lineItemsResult.previewLineItems.map((item) => ({
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

	return {
		...lineItemsResult,
		previewLineItems,
		subtotal: prorationRatio
			.mul(lineItemsResult.subtotal)
			.toDecimalPlaces(2)
			.toNumber(),
		total: prorationRatio
			.mul(lineItemsResult.total)
			.toDecimalPlaces(2)
			.toNumber(),
	};
};

export const billingPlanToNextCyclePreview = ({
	ctx,
	billingContext,
	billingPlan,
	customerProductFilter,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	/** Scope the preview to a subset of products (e.g. one subscription's). */
	customerProductFilter?: (customerProduct: FullCusProduct) => boolean;
}): NextCyclePreviewResult => {
	const { billingCycleAnchorMs } = billingContext;

	const finalFullCustomer = autumnBillingPlanToFinalFullCustomer({
		billingContext,
		autumnBillingPlan: billingPlan.autumn,
	});
	const allCustomerProducts = customerProductFilter
		? finalFullCustomer.customer_products.filter(customerProductFilter)
		: finalFullCustomer.customer_products;

	const customerProducts = allCustomerProducts.filter((customerProduct) => {
		const isPaidRecurring = cp(customerProduct)
			.paid()
			.recurring()
			.hasRelevantStatus().valid;
		const startsInFuture =
			cp(customerProduct).scheduled().valid &&
			!hasCustomerProductStarted(customerProduct, {
				nowMs: billingContext.currentEpochMs,
				// toleranceMs: 0,
			});
		return isPaidRecurring || startsInFuture;
	});

	const currentCustomerProducts = allCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasActiveStatus().valid,
	);

	const anchorMs =
		billingCycleAnchorMs === "now"
			? billingContext.currentEpochMs
			: billingCycleAnchorMs;

	const event = getNextCycleEvent({
		billingContext,
		customerProducts,
		anchorMs,
	});

	const baseDebug = {
		allCustomerProducts,
		currentCustomerProducts,
		smallestInterval: event.kind === "none" ? null : event.smallestInterval,
		anchorMs,
	};

	if (event.kind === "none") {
		return {
			nextCycle: undefined,
			debug: {
				...baseDebug,
				nextCycleStart: null,
				filteredCustomerProducts: [],
			},
		};
	}

	if (event.kind === "scheduled_change") {
		const productsForUsageLineItems = getActiveCustomerProductsAt({
			customerProducts,
			startsAtMs: event.startsAtMs - MS_PER_SECOND,
		});
		const lineItemsResult = billingPlanToNextCycleLineItems({
			ctx,
			customerProducts: [
				...event.incomingCustomerProducts,
				...event.outgoingCustomerProducts,
			],
			productsForUsageLineItems,
			lineItemSpecs: [
				{
					customerProducts: event.incomingCustomerProducts,
					direction: "charge",
					billingCycleAnchorMs: event.resetsBillingCycle
						? event.startsAtMs
						: anchorMs,
					filterBillingPeriodStart: false,
					priceFilters: { excludeOneOffPrices: true },
				},
				{
					customerProducts: event.outgoingCustomerProducts,
					direction: "refund",
					billingCycleAnchorMs: anchorMs,
					filterBillingPeriodStart: false,
					priceFilters: { excludeOneOffPrices: true },
				},
			],
			autumnBillingPlan: billingPlan.autumn,
			billingContext,
			nextCycleStart: event.startsAtMs,
		});

		return {
			nextCycle: {
				starts_at: event.startsAtMs,
				subtotal: lineItemsResult.subtotal,
				total: lineItemsResult.total,
				line_items: lineItemsResult.previewLineItems,
				usage_line_items: lineItemsResult.previewUsageLineItems,
			},
			debug: {
				...baseDebug,
				nextCycleStart: event.startsAtMs,
				filteredCustomerProducts: event.incomingCustomerProducts,
			},
		};
	}

	if (event.kind === "scheduled_start") {
		const productsForUsageLineItems = getActiveCustomerProductsAt({
			customerProducts,
			startsAtMs: event.startsAtMs - MS_PER_SECOND,
		});
		const billingCycleAnchorMs =
			event.resetsBillingCycle || productsForUsageLineItems.length === 0
				? event.startsAtMs
				: anchorMs;
		const lineItemsResult = billingPlanToNextCycleLineItems({
			ctx,
			customerProducts: event.customerProducts,
			productsForUsageLineItems,
			lineItemSpecs: [
				{
					customerProducts: event.customerProducts,
					direction: "charge",
					billingCycleAnchorMs,
					filterBillingPeriodStart: false,
				},
			],
			autumnBillingPlan: billingPlan.autumn,
			billingContext,
			nextCycleStart: event.startsAtMs,
		});

		return {
			nextCycle: {
				starts_at: event.startsAtMs,
				subtotal: lineItemsResult.subtotal,
				total: lineItemsResult.total,
				line_items: lineItemsResult.previewLineItems,
				usage_line_items: lineItemsResult.previewUsageLineItems,
			},
			debug: {
				...baseDebug,
				nextCycleStart: event.startsAtMs,
				filteredCustomerProducts: event.customerProducts,
			},
		};
	}

	let nextCycleStart: number;
	let lineItemsBillingContext: BillingContext = billingContext;
	let prorationRatio: Decimal | undefined;
	let nextCycleCustomerProducts: FullCusProduct[];

	if (event.kind === "anchor_reset") {
		const result = computeScheduledAnchorResetPreview({
			billingContext,
			interval: event.smallestInterval.interval,
			intervalCount: event.smallestInterval.intervalCount,
		});
		nextCycleStart = result.nextCycleStart;
		prorationRatio = result.prorationRatio;
		lineItemsBillingContext = result.lineItemsBillingContext;
		nextCycleCustomerProducts = customerProducts;
	} else {
		nextCycleStart = event.startsAtMs;
		nextCycleCustomerProducts = event.customerProducts;
	}

	const filteredCustomerProducts = filterCustomerProductsForEventStart({
		customerProducts: nextCycleCustomerProducts,
		nextCycleStart,
	});

	if (filteredCustomerProducts.length === 0) {
		return {
			nextCycle: undefined,
			debug: { ...baseDebug, nextCycleStart, filteredCustomerProducts },
		};
	}

	const productsForUsageLineItems = getActiveCustomerProductsAt({
		customerProducts,
		startsAtMs: nextCycleStart - MS_PER_SECOND,
	});
	let lineItemsResult = billingPlanToNextCycleLineItems({
		ctx,
		customerProducts: filteredCustomerProducts,
		productsForUsageLineItems,
		autumnBillingPlan: billingPlan.autumn,
		billingContext: {
			...lineItemsBillingContext,
			billingCycleAnchorMs:
				lineItemsBillingContext.billingCycleAnchorMs === "now"
					? anchorMs
					: lineItemsBillingContext.billingCycleAnchorMs,
		},
		nextCycleStart,
	});

	if (prorationRatio) {
		lineItemsResult = scaleNextCycleAmounts({
			lineItemsResult,
			prorationRatio,
		});
	}

	return {
		nextCycle: {
			starts_at: nextCycleStart,
			subtotal: lineItemsResult.subtotal,
			total: lineItemsResult.total,
			line_items: lineItemsResult.previewLineItems,
			usage_line_items: lineItemsResult.previewUsageLineItems,
		},
		debug: { ...baseDebug, nextCycleStart, filteredCustomerProducts },
	};
};
