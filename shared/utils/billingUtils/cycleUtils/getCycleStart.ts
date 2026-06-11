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
	let cyclesPassed = Math.floor(intervalsPassed / intervalCount);

	// date-fns shaves a cycle on a clamped end-of-month boundary (e.g.
	// differenceInMonths(Apr 30, Jan 31) === 2, not 3) and on future anchors, so the
	// estimate can land in the wrong cycle. Walk to the one that brackets `now`;
	// boundaries are monotonic, so this is a bounded correction.
	while (add(anchorDate, (cyclesPassed + 1) * intervalCount).getTime() <= now) {
		cyclesPassed += 1;
	}
	while (add(anchorDate, cyclesPassed * intervalCount).getTime() > now) {
		cyclesPassed -= 1;
	}

	const result = add(anchorDate, cyclesPassed * intervalCount).getTime();

	// If floor is provided and result is before floor, return floor
	if (floor !== undefined && result < floor) {
		return floor;
	}

	return result;
};
