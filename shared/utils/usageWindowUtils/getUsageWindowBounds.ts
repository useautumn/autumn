import { UTCDate } from "@date-fns/utc";
import {
	startOfDay,
	startOfHour,
	startOfMinute,
	startOfMonth,
	startOfQuarter,
	startOfWeek,
	startOfYear,
} from "date-fns";
import { EntInterval } from "../../models/productModels/intervals/entitlementInterval.js";
import { addInterval } from "../billingUtils/intervalUtils/intervalArithmetic.js";

const LIFETIME_WINDOW_END = Number.MAX_SAFE_INTEGER;

// UTC-calendar-aligned start of the interval containing `now`. Alignment keeps
// the window (and therefore its key) deterministic from `now` alone, so the TS
// and Lua sides never disagree on which window a track lands in.
const startOfWindow = ({
	interval,
	now,
}: {
	interval: EntInterval;
	now: number;
}): number => {
	const from = new UTCDate(now);

	switch (interval) {
		case EntInterval.Minute:
			return startOfMinute(from).getTime();
		case EntInterval.Hour:
			return startOfHour(from).getTime();
		case EntInterval.Day:
			return startOfDay(from).getTime();
		case EntInterval.Week:
			return startOfWeek(from, { weekStartsOn: 1 }).getTime();
		case EntInterval.Month:
			return startOfMonth(from).getTime();
		case EntInterval.Quarter:
			return startOfQuarter(from).getTime();
		case EntInterval.SemiAnnual: {
			const yearStart = startOfYear(from).getTime();
			return from.getUTCMonth() < 6
				? yearStart
				: addInterval({
						from: yearStart,
						interval: EntInterval.Month,
						intervalCount: 6,
					});
		}
		case EntInterval.Year:
			return startOfYear(from).getTime();
		default:
			return now;
	}
};

/**
 * Current usage-window bounds for an interval, aligned to the UTC calendar.
 * `lifetime` never resets. Each window spans exactly one interval (sub-interval
 * counts are intentionally not supported yet; they need non-overlapping tiling).
 */
export const getUsageWindowBounds = ({
	interval,
	now,
}: {
	interval: EntInterval;
	now: number;
}): { windowStartAt: number; windowEndAt: number } => {
	if (interval === EntInterval.Lifetime) {
		return { windowStartAt: 0, windowEndAt: LIFETIME_WINDOW_END };
	}

	const windowStartAt = startOfWindow({ interval, now });
	const windowEndAt = addInterval({ from: windowStartAt, interval });

	return { windowStartAt, windowEndAt };
};
