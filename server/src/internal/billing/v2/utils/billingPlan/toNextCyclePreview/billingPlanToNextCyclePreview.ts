import {
	type BillingContext,
	type BillingPlan,
	type BillingPreviewResponse,
	cp,
	customerProductsToStripeSubscriptionIds,
	type FullCusProduct,
	hasCustomerProductEnded,
	hasCustomerProductStarted,
	isCustomerProductOnStripeSubscription,
	timestampsMatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhaseProration } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { phaseStartCreditsUnusedTime } from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";
import {
	billingPlanToNextCycleLineItems,
	type NextCycleLineItemOptions,
} from "./billingPlanToNextCycleLineItems";
import { computeScheduledAnchorResetPreview } from "./computeScheduledAnchorResetPreview";
import { findNextInvoicedCycleEvent } from "./findNextInvoicedCycleEvent";
import {
	getActiveCustomerProductsAt,
	type NextCycleEvent,
	type SmallestInterval,
} from "./getNextCycleEvent";
import type { AnchorResetProration } from "./prorateAnchorResetLineItem";

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

const outgoingPlansRunToBoundary = ({
	outgoingCustomerProducts,
	transitionMs,
	renewalBoundaryMs,
}: {
	outgoingCustomerProducts: FullCusProduct[];
	transitionMs: number;
	renewalBoundaryMs: number;
}): boolean =>
	timestampsMatch(transitionMs, renewalBoundaryMs) &&
	outgoingCustomerProducts.length > 0 &&
	outgoingCustomerProducts.every(
		(customerProduct) =>
			customerProduct.ended_at != null &&
			timestampsMatch(customerProduct.ended_at, renewalBoundaryMs),
	);

/** A change on a shared subscription at renewal doesn't end it, so the plans
 * that stay on that subscription still renew at the boundary. */
const getPlansRenewingThroughChange = ({
	event,
	customerProducts,
}: {
	event: Extract<NextCycleEvent, { kind: "scheduled_change" }>;
	customerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	if (!timestampsMatch(event.startsAtMs, event.renewalBoundaryMs)) return [];

	const changedSubscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: [
			...event.outgoingCustomerProducts,
			...event.incomingCustomerProducts,
		],
	});
	const changedIds = new Set(
		[...event.outgoingCustomerProducts, ...event.incomingCustomerProducts].map(
			(customerProduct) => customerProduct.id,
		),
	);
	return getActiveCustomerProductsAt({
		customerProducts,
		startsAtMs: event.startsAtMs,
	}).filter(
		(customerProduct) =>
			!changedIds.has(customerProduct.id) &&
			changedSubscriptionIds.some((stripeSubscriptionId) =>
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId,
				}),
			),
	);
};

export const billingPlanToNextCyclePreview = ({
	ctx,
	billingContext,
	billingPlan,
	customerProductFilter,
	phaseProrations,
	options,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	/** Scope the preview to a subset of products (e.g. one subscription's). */
	customerProductFilter?: (customerProduct: FullCusProduct) => boolean;
	phaseProrations: SchedulePhaseProration[];
	options?: NextCycleLineItemOptions;
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

	const currentAnchorMs =
		billingCycleAnchorMs === "now"
			? billingContext.currentEpochMs
			: billingCycleAnchorMs;

	const { event, anchorMs } = findNextInvoicedCycleEvent({
		billingContext,
		customerProducts,
		anchorMs: currentAnchorMs,
		phaseProrations,
	});
	// An uninvoiced anchor reset moved the cycle before this event, so it bills from the new anchor.
	const cycleBillingContext: BillingContext =
		anchorMs === currentAnchorMs
			? billingContext
			: { ...billingContext, billingCycleAnchorMs: anchorMs };

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
		const chargeNewPlan = {
			customerProducts: event.incomingCustomerProducts,
			direction: "charge" as const,
			billingCycleAnchorMs: event.resetsBillingCycle
				? event.startsAtMs
				: anchorMs,
			filterBillingPeriodStart: false,
			priceFilters: { excludeOneOffPrices: true },
		};

		// The old plan's credit is what it last paid for: an uninvoiced reset moved its cycle without billing it.
		const creditOldPlanUnusedTime = {
			customerProducts: event.outgoingCustomerProducts,
			direction: "refund" as const,
			billingCycleAnchorMs: currentAnchorMs,
			filterBillingPeriodStart: false,
			priceFilters: { excludeOneOffPrices: true },
		};

		const keepsOldPlanCredit =
			phaseStartCreditsUnusedTime({
				prorationBehavior: event.prorationBehavior,
			}) &&
			!outgoingPlansRunToBoundary({
				outgoingCustomerProducts: event.outgoingCustomerProducts,
				transitionMs: event.startsAtMs,
				renewalBoundaryMs: event.renewalBoundaryMs,
			});
		const renewingCustomerProducts = getPlansRenewingThroughChange({
			event,
			customerProducts,
		});
		// Mirrors the renewal path: only prices whose period starts at the boundary.
		const renewRemainingPlans = {
			customerProducts: renewingCustomerProducts,
			direction: "charge" as const,
			billingCycleAnchorMs: anchorMs,
			priceFilters: { excludeOneOffPrices: true },
		};
		const lineItemSpecs = [
			chargeNewPlan,
			...(keepsOldPlanCredit ? [creditOldPlanUnusedTime] : []),
			renewRemainingPlans,
		];

		const lineItemsResult = billingPlanToNextCycleLineItems({
			ctx,
			customerProducts: [
				...event.incomingCustomerProducts,
				...event.outgoingCustomerProducts,
				...renewingCustomerProducts,
			],
			productsForUsageLineItems,
			lineItemSpecs,
			autumnBillingPlan: billingPlan.autumn,
			billingContext: cycleBillingContext,
			nextCycleStart: event.startsAtMs,
			options,
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
				filteredCustomerProducts: [
					...event.incomingCustomerProducts,
					...renewingCustomerProducts,
				],
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
			billingContext: cycleBillingContext,
			nextCycleStart: event.startsAtMs,
			options,
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
	let lineItemsBillingContext: BillingContext = cycleBillingContext;
	let anchorResetProration: AnchorResetProration | undefined;
	let nextCycleCustomerProducts: FullCusProduct[];

	if (event.kind === "anchor_reset") {
		const result = computeScheduledAnchorResetPreview({
			billingContext: cycleBillingContext,
			scheduledAnchor: event.startsAtMs,
			interval: event.smallestInterval.interval,
			intervalCount: event.smallestInterval.intervalCount,
		});
		nextCycleStart = result.nextCycleStart;
		anchorResetProration = result.anchorResetProration;
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
	const lineItemsResult = billingPlanToNextCycleLineItems({
		ctx,
		customerProducts: filteredCustomerProducts,
		productsForUsageLineItems,
		// Only an anchor inside the period restarts every item there; otherwise it's a renewal.
		lineItemSpecs: anchorResetProration
			? [
					{
						customerProducts: filteredCustomerProducts,
						direction: "charge",
						billingCycleAnchorMs: nextCycleStart,
						filterBillingPeriodStart: false,
						priceFilters: { excludeOneOffPrices: true },
					},
				]
			: undefined,
		autumnBillingPlan: billingPlan.autumn,
		billingContext: {
			...lineItemsBillingContext,
			billingCycleAnchorMs:
				lineItemsBillingContext.billingCycleAnchorMs === "now"
					? anchorMs
					: lineItemsBillingContext.billingCycleAnchorMs,
		},
		nextCycleStart,
		anchorResetProration,
		options,
	});

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
