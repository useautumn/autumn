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
	let cyclesPassed = Math.floor(intervalsPassed / intervalCount);

	// Same clamped-boundary correction as getCycleStart: land on the cycle that
	// brackets `now`, then the end is the next boundary after it (always > now).
	while (add(anchorDate, (cyclesPassed + 1) * intervalCount).getTime() <= now) {
		cyclesPassed += 1;
	}
	while (add(anchorDate, cyclesPassed * intervalCount).getTime() > now) {
		cyclesPassed -= 1;
	}

	const result = add(anchorDate, (cyclesPassed + 1) * intervalCount).getTime();

	// If floor is provided and result is before floor, return floor
	if (floor !== undefined && result < floor) {
		return floor;
	}

	return result;
};
