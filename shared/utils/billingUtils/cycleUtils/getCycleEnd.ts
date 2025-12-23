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
 * @returns Unix timestamp of the next cycle end
 */
export const getCycleEnd = ({
	anchor,
	interval,
	intervalCount = 1,
	now,
}: {
	anchor: number;
	interval: BillingInterval | EntInterval;
	intervalCount?: number;
	now: number; // milliseconds since epoch
}): number => {
	// EDGE CASE: anchor might be slightly before now due to network latency.

	const anchorDate = new UTCDate(anchor);
	const nowDate = new UTCDate(now);

	// For now, only handle monthly intervals
	// TODO: Add support for other intervals

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

	// const TOLERANCE_MS = 30 * 1000; // 30 seconds buffer for network latency

	/* TO CHECK: To we need a tolerance buffer? If so how much (seconds, milliseconds, etc.?) */
	const candidate = add(anchorDate, cyclesPassed * intervalCount);
	if (candidate.getTime() > now) return candidate.getTime();

	return nextCycleEnd.getTime();
};

