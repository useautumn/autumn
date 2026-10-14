import { UTCDate } from "@date-fns/utc";
import type { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import type { EntInterval } from "@models/productModels/intervals/entitlementInterval.js";
import { getCycleIntervalFunctions } from "./getCycleIntervalFunctions.js";

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
	now: number;
	floor?: number;
}): number => {
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

	while (add(anchorDate, (cyclesPassed + 1) * intervalCount).getTime() <= now) {
		cyclesPassed += 1;
	}
	while (add(anchorDate, cyclesPassed * intervalCount).getTime() > now) {
		cyclesPassed -= 1;
	}

	const result = add(anchorDate, (cyclesPassed + 1) * intervalCount).getTime();

	if (floor !== undefined && result < floor) {
		return floor;
	}

	return result;
};
