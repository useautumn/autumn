import type { BillingPeriod } from "../../../../models/billingModels/lineItem/lineItemContext";

/**
 * Computes the effective billing period for a line item.
 *
 * The effective period is the actual time range being charged or refunded,
 * accounting for mid-cycle changes.
 *
 * - In-arrear: billing for past usage (start → now), clipped at `startFloor`
 *   (the subscription's creation) since nothing was used before it existed
 * - In-advance: billing for future usage (now → end), cut at `endsAt`
 *
 * @example
 * // Mid-cycle upgrade on Feb 15 (cycle is Feb 1 - Mar 1)
 * // In-advance charge: Feb 15 → Mar 1
 * getEffectivePeriod({
 *   now: feb15Ms,
 *   billingPeriod: { start: feb1Ms, end: mar1Ms },
 *   billingTiming: "in_advance",
 * });
 * // Returns: { start: feb15Ms, end: mar1Ms }
 */
export const getEffectivePeriod = ({
	now,
	billingPeriod,
	billingTiming,
	startFloor,
	endsAt,
}: {
	now: number;
	billingPeriod: BillingPeriod;
	billingTiming: "in_arrear" | "in_advance";
	startFloor?: number;
	endsAt?: number;
}): BillingPeriod => {
	if (billingTiming === "in_arrear") {
		const start =
			startFloor === undefined
				? billingPeriod.start
				: Math.max(billingPeriod.start, startFloor);
		return { start, end: now };
	}
	// Billing for future usage: now → end, or until the product ends first
	return {
		start: now,
		end: Math.min(billingPeriod.end, endsAt ?? billingPeriod.end),
	};
};
