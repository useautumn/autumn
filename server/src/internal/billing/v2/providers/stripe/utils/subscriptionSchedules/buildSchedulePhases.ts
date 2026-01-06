import {
	type FullCusProduct,
	formatMs,
	formatMsToDate,
	msToSeconds,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs";
import { isCustomerProductActiveDuringPeriod } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isCustomerProductActiveAtEpochMs";
import { buildTransitionPoints } from "./buildTransitionPoints";

/**
 * Converts customer products to Stripe schedule phase items.
 * Merges quantities for duplicate price IDs.
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
	const itemMap = new Map<string, number>(); // stripePriceId -> quantity

	for (const customerProduct of customerProducts) {
		const { recurringItems } = customerProductToStripeItemSpecs({
			ctx,
			customerProduct,
			billingContext,
		});

		for (const item of recurringItems) {
			const currentQuantity = itemMap.get(item.stripePriceId) ?? 0;
			itemMap.set(item.stripePriceId, currentQuantity + (item.quantity ?? 1));
		}
	}

	return Array.from(itemMap.entries()).map(([price, quantity]) => ({
		price,
		quantity,
	}));
};

/**
 * Builds Stripe subscription schedule phases.
 *
 * Takes add/remove customer products and computes phases based on
 * when products start or end (transition points).
 */
export const buildSchedulePhases = ({
	ctx,
	billingContext,
	customerProducts,
	trialEndsAt,
	nowMs,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	trialEndsAt?: number;
	nowMs: number;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	// 2. Find all transition points
	const transitionPoints = buildTransitionPoints({
		customerProducts,
		nowMs,
	});

	console.log(
		"Transition points:",
		transitionPoints.map((tp) => (tp ? formatMs(tp) : "infinity")),
	);

	console.log(
		"Customer products:",
		customerProducts.map((cp) => ({
			name: cp.product.name,
			status: cp.status,
			trialEndsAt: formatMs(cp.trial_ends_at),
			start: formatMs(cp.starts_at),
			end: formatMs(cp.ended_at),
		})),
	);

	let startMs = nowMs;

	const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];
	for (let i = 0; i < transitionPoints.length; i++) {
		const transitionPoint = transitionPoints[i];
		const endMs = transitionPoint;
		const phaseIndex = i;

		// 1. Get customer products from now -> transition point
		const activeCustomerProducts = customerProducts.filter((cp) =>
			isCustomerProductActiveDuringPeriod({
				customerProduct: cp,
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

		console.log(
			`[phase ${phaseIndex}] ${formatMsToDate(startMs)} to ${endMs ? formatMsToDate(endMs) : "infinity"}, Active: ${activeCustomerProducts.map((cp) => `${cp.product.name} (${cp.entity_id ?? "customer"})`).join(", ")}`,
		);

		// Only set trial_end if trial extends into this phase
		// Constraint: trial_end must be ≤ phase end_date
		const computePhaseTrialEndsAt = (): number | undefined => {
			// No trial configured
			if (!trialEndsAt) return undefined;

			// Trial already ended before this phase starts
			if (trialEndsAt <= startMs) return undefined;

			// Trial extends beyond this phase - whole phase is on trial
			if (endMs && trialEndsAt > endMs) {
				return msToSeconds(endMs);
			}

			// Trial ends within this phase
			return msToSeconds(trialEndsAt);
		};

		phases.push({
			items: phaseItems,
			start_date: msToSeconds(startMs),
			end_date: endMs ? msToSeconds(endMs) : undefined,
			trial_end: computePhaseTrialEndsAt(),
		});

		if (endMs) {
			startMs = endMs;
		}
	}

	return phases;
};
