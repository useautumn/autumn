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
import { getCycleEnd } from "../billingUtils/cycleUtils/getCycleEnd.js";
import { getCycleStart } from "../billingUtils/cycleUtils/getCycleStart.js";
import { addInterval } from "../billingUtils/intervalUtils/intervalArithmetic.js";

const LIFETIME_WINDOW_END = Number.MAX_SAFE_INTEGER;

// UTC-calendar-aligned start of the interval containing `now`. Used only as the
// fallback when no billing-cycle anchor is available; alignment keeps the window
// (and its key) deterministic from `now` alone so TS and Lua never disagree.
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
 * Current usage-window bounds for an interval. When a billing-cycle `anchor` is
 * given, bounds align to the customer's cycle (so a "daily" cap rolls on their
 * billing time-of-day, not UTC midnight). Without an anchor, falls back to UTC
 * calendar alignment. `lifetime` never resets. Each window spans one interval.
 */
export const getUsageWindowBounds = ({
	interval,
	now,
	anchor,
}: {
	interval: EntInterval;
	now: number;
	anchor?: number | null;
}): { windowStartAt: number; windowEndAt: number } => {
	if (interval === EntInterval.Lifetime) {
		return { windowStartAt: 0, windowEndAt: LIFETIME_WINDOW_END };
	}

	if (anchor != null && Number.isFinite(anchor)) {
		const cycleStartAt = getCycleStart({ anchor, interval, now });
		const cycleEndAt = getCycleEnd({ anchor, interval, now });
		// Only trust cycle bounds that are finite and actually bracket `now`; a bad
		// billing anchor must fall back to calendar, never poison the deduction.
		if (
			Number.isFinite(cycleStartAt) &&
			Number.isFinite(cycleEndAt) &&
			cycleStartAt <= now &&
			now < cycleEndAt
		) {
			return { windowStartAt: cycleStartAt, windowEndAt: cycleEndAt };
		}
	}

	const windowStartAt = startOfWindow({ interval, now });
	const windowEndAt = addInterval({ from: windowStartAt, interval });

	return { windowStartAt, windowEndAt };
};
