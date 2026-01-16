import { UTCDate } from "@date-fns/utc";
import type { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { getCycleIntervalFunctions } from "./getCycleIntervalFunctions.js";

/**
 * Get the next cycle end after `now`, aligned to the anchor.
 *
 * Uses mathematical calculation instead of iteration:
 * 1. Calculate how many full cycles have passed since anchor
 * 2. The next cycle end is (cyclesPassed + 1) cycles from anchor
 *
 * @param anchor - The billing cycle anchor (unix ms)
 * @param interval - BillingInterval or EntInterval
 * @param intervalCount - Number of intervals per cycle (default: 1)
 * @param now - Current time (defaults to Date.now())
 * @param floor - Minimum allowed result (unix ms). If the calculated cycle end is before
 *   this value, returns the floor instead. Use this when billing cannot start before a
 *   certain date (e.g., trial end date for long trials).
 *   Example: Trial ends 4 Aug (anchor), now is 16 Jan, monthly interval.
 *   Without floor: returns 4 Feb (next monthly boundary after now).
 *   With floor=4 Aug: returns 4 Aug (billing can't start before trial ends).
 * @returns Unix timestamp of the next cycle end
 */
export const getCycleEnd = ({
	anchor,
	interval,
	intervalCount = 1,
	now,
	floor,
}: {
	anchor: number | "now";
	interval: BillingInterval | EntInterval;
	intervalCount?: number;
	now: number; // milliseconds since epoch
	floor?: number;
}): number => {
	// EDGE CASE: anchor might be slightly before now due to network latency.

	const anchorDate = anchor === "now" ? new UTCDate(now) : new UTCDate(anchor);
	const nowDate = new UTCDate(now);

	const intervalFunctions = getCycleIntervalFunctions({ interval });

	if (!intervalFunctions) {
		throw new Error(
			`[internal] failed to get interval functions to calculate cycle end for interval: ${interval}`,
		);
	}

	const { add, difference } = intervalFunctions;

	const intervalsPassed = difference(nowDate, anchorDate);

	// How many complete cycles have passed?
	// e.g., if intervalCount=2 and 5 months passed, that's 2 complete cycles
	const cyclesPassed = Math.floor(intervalsPassed / intervalCount);

	// Next cycle end is (cyclesPassed + 1) * intervalCount months from anchor
	const nextCycleEnd = add(anchorDate, (cyclesPassed + 1) * intervalCount);

	/**
	 * Handling edge case with date-fns anchor in the future
	 * Example: anchorDate: 28 Feb, nowDate: 15 Jan -> Next cycle end will be 28 Feb
	 * This is because of how differenceInMonths rounds down
	 * (28 Feb will see cycles passes as -1, so next cycle will be anchorDate + (-1 + 1) months)
	 */

	const candidate = add(anchorDate, cyclesPassed * intervalCount);
	const result =
		candidate.getTime() > now ? candidate.getTime() : nextCycleEnd.getTime();

	// If floor is provided and result is before floor, return floor
	if (floor !== undefined && result < floor) {
		return floor;
	}

	return result;
};
