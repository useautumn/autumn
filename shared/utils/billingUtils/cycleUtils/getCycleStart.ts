import { UTCDate } from "@date-fns/utc";
import type { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { getCycleIntervalFunctions } from "./getCycleIntervalFunctions.js";

/**
 * Get the start of the current cycle that contains `now`, aligned to the anchor.
 *
 * Uses mathematical calculation instead of iteration:
 * 1. Calculate how many full cycles have passed since anchor
 * 2. The cycle start is cyclesPassed cycles from anchor
 *
 * @param anchor - The billing cycle anchor (unix ms)
 * @param interval - BillingInterval or EntInterval
 * @param intervalCount - Number of intervals per cycle (default: 1)
 * @param now - Current time (defaults to Date.now())
 * @param floor - Minimum allowed result (unix ms). If the calculated cycle start is before
 *   this value, returns the floor instead. Use this when the subscription/entity didn't
 *   exist before a certain date (e.g., subscription creation date).
 *   Example: Subscription starts 1 Jan, anchor is 15 Jan, now is 5 Jan.
 *   Without floor: returns 15 Dec (previous cycle boundary).
 *   With floor=1 Jan: returns 1 Jan (subscription start).
 * @returns Unix timestamp of the current cycle start
 */
export const getCycleStart = ({
	anchor,
	interval,
	intervalCount = 1,
	now,
	floor,
}: {
	anchor: number | "now";
	interval: BillingInterval | EntInterval;
	intervalCount?: number;
	now: number; // milliseconds since epoch;
	floor?: number;
}): number => {
	const anchorDate = anchor === "now" ? new UTCDate(now) : new UTCDate(anchor);
	const nowDate = new UTCDate(now);

	const intervalFunctions = getCycleIntervalFunctions({ interval });

	if (!intervalFunctions) {
		throw new Error(
			`[internal] failed to get interval functions to calculate cycle start for interval: ${interval}`,
		);
	}

	const { add, difference } = intervalFunctions;

	const intervalsPassed = difference(nowDate, anchorDate);

	// How many complete cycles have passed?
	const cyclesPassed = Math.floor(intervalsPassed / intervalCount);

	// Cycle start is cyclesPassed * intervalCount from anchor
	const cycleStart = add(anchorDate, cyclesPassed * intervalCount);

	/**
	 * Handling edge case with date-fns anchor in the future
	 * Example: anchorDate: 28 Apr, nowDate: 15 Jan -> differenceInMonths gives -3
	 * cyclesPassed = floor(-3/3) = -1, so cycleStart = Apr 28 - 3 = Jan 28
	 * But Jan 28 > Jan 15, so we overshot - need to go back one more cycle to Oct 28
	 */
	let finalCycleStart = cycleStart;
	if (cycleStart.getTime() > now) {
		finalCycleStart = add(anchorDate, (cyclesPassed - 1) * intervalCount);
	}

	const result = finalCycleStart.getTime();

	// If floor is provided and result is before floor, return floor
	if (floor !== undefined && result < floor) {
		return floor;
	}

	return result;
};
