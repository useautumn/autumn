import {
	type FullCusProduct,
	msToSeconds,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type Stripe from "stripe";
import { logPhase } from "@/external/stripe/subscriptionSchedules/utils/logStripeSchedulePhaseUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import { isCustomerProductActiveDuringPeriod } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isCustomerProductActiveAtEpochMs";
import type { BillingContext } from "@/internal/billing/v2/types";
import { buildTransitionPoints } from "./buildTransitionPoints";
import { logTransitionPoints } from "./logBuildPhaseHelpers";

/**
 * Normalizes customer product timestamps to second-level precision.
 * This ensures consistency with Stripe's second-based timestamps.
 */
const normalizeCustomerProductTimestamps = (
	customerProduct: FullCusProduct,
): FullCusProduct => ({
	...customerProduct,
	starts_at: truncateMsToSecondPrecision(customerProduct.starts_at),
	ended_at: customerProduct.ended_at
		? truncateMsToSecondPrecision(customerProduct.ended_at)
		: undefined,
});

/**
 * Converts customer products to Stripe schedule phase items.
 * Merges quantities for duplicate price IDs.
 * For metered prices (quantity undefined), we don't set quantity as Stripe requires.
 */
const customerProductsToPhaseItems = ({
	ctx,
	billingContext,
	customerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
}): Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] => {
	// Track stripePriceId -> quantity (undefined means metered/no quantity)
	const itemMap = new Map<string, number | undefined>();

	for (const customerProduct of customerProducts) {
		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			customerProduct,
			billingContext,
		});

		for (const item of recurringItems) {
			// For metered prices, quantity is undefined and should stay undefined
			if (item.quantity === undefined) {
				// Metered price - don't set quantity
				if (!itemMap.has(item.stripePriceId)) {
					itemMap.set(item.stripePriceId, undefined);
				}
			} else {
				// Licensed price - accumulate quantity
				const currentQuantity = itemMap.get(item.stripePriceId) ?? 0;
				itemMap.set(item.stripePriceId, currentQuantity + item.quantity);
			}
		}
	}

	return Array.from(itemMap.entries()).map(([price, quantity]) => {
		if (quantity === undefined) {
			return { price };
		}
		return { price, quantity };
	});
};

/**
 * Builds Stripe subscription schedule phases.
 *
 * Takes add/remove customer products and computes phases based on
 * when products start or end (transition points).
 */
export const buildStripePhasesUpdate = ({
	ctx,
	billingContext,
	customerProducts,
	trialEndsAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	trialEndsAt?: number;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	// Normalize all timestamps to second-level precision for Stripe compatibility.
	// This is done once at the entry point so downstream functions work with clean data.
	const nowMs = truncateMsToSecondPrecision(billingContext.currentEpochMs);
	const normalizedTrialEndsAt = trialEndsAt
		? truncateMsToSecondPrecision(trialEndsAt)
		: undefined;
	const normalizedCustomerProducts = customerProducts.map(
		normalizeCustomerProductTimestamps,
	);

	// Find all transition points
	const transitionPoints = buildTransitionPoints({
		customerProducts: normalizedCustomerProducts,
		nowMs,
		trialEndsAt: normalizedTrialEndsAt,
	});

	const debugLogs = false;

	// Log customer products and transition points
	if (debugLogs) {
		logTransitionPoints({
			ctx,
			customerProducts: normalizedCustomerProducts,
			transitionPoints,
			nowMs,
		});
	}

	let startMs = nowMs;

	const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];
	for (let i = 0; i < transitionPoints.length; i++) {
		const transitionPoint = transitionPoints[i];
		const endMs = transitionPoint;
		const phaseIndex = i;

		// 1. Get customer products from now -> transition point
		const activeCustomerProducts = normalizedCustomerProducts.filter(
			(customerProduct) =>
				isCustomerProductActiveDuringPeriod({
					customerProduct,
					startMs,
					endMs,
				}),
		);

		// 2. Build phase items
		const phaseItems = customerProductsToPhaseItems({
			ctx,
			billingContext,
			customerProducts: activeCustomerProducts,
		});

		// Only set trial_end if trial extends into this phase
		// Constraint: trial_end must be ≤ phase end_date
		const computePhaseTrialEndsAt = (): number | undefined => {
			// No trial configured
			if (!normalizedTrialEndsAt) return undefined;

			// Trial already ended before this phase starts
			if (normalizedTrialEndsAt <= startMs) return undefined;

			// Trial extends beyond this phase - whole phase is on trial
			if (endMs && normalizedTrialEndsAt > endMs) {
				return msToSeconds(endMs);
			}

			// Trial ends within this phase
			return msToSeconds(normalizedTrialEndsAt);
		};

		const phase: Stripe.SubscriptionScheduleUpdateParams.Phase = {
			items: phaseItems,
			start_date: msToSeconds(startMs),
			end_date: endMs ? msToSeconds(endMs) : undefined,
			trial_end: computePhaseTrialEndsAt(),
		};

		// Log phase details
		if (debugLogs) {
			logPhase({
				ctx,
				phase,
				customerProducts: activeCustomerProducts,
				phaseIndex,
				logPrefix: "[buildStripePhasesUpdate]",
				showCustomerProducts: true,
			});
		}

		phases.push(phase);

		if (endMs) {
			startMs = endMs;
		}
	}

	return phases;
};
