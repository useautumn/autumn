import { UTCDate } from "@date-fns/utc";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	addYears,
	getDate,
} from "date-fns";

// Union type for all intervals
type Interval = BillingInterval | EntInterval;

// Intervals that support end-of-month preservation
const MONTH_BASED_INTERVALS = [
	BillingInterval.Month,
	BillingInterval.Quarter,
	BillingInterval.SemiAnnual,
	BillingInterval.Year,
	EntInterval.Month,
	EntInterval.Quarter,
	EntInterval.SemiAnnual,
	EntInterval.Year,
] as const;

/**
 * Adds an interval to a timestamp.
 * For month-based intervals, preserves the anchor day (Stripe-compatible end-of-month behavior).
 *
 * @param from - Unix timestamp in milliseconds
 * @param interval - BillingInterval or EntInterval
 * @param intervalCount - Number of intervals to add (default: 1)
 * @returns Unix timestamp in milliseconds
 */
export const addInterval = ({
	from,
	interval,
	intervalCount = 1,
}: {
	from: number;
	interval: Interval;
	intervalCount?: number;
}): number => {
	const fromDate = new UTCDate(from);
	const anchorDay = getDate(fromDate);

	const isMonthBased = (MONTH_BASED_INTERVALS as readonly string[]).includes(
		interval,
	);

	let result: UTCDate;

	switch (interval) {
		// Fine-grained intervals (EntInterval only)
		case EntInterval.Minute:
			return addMinutes(fromDate, intervalCount).getTime();
		case EntInterval.Hour:
			return addHours(fromDate, intervalCount).getTime();
		case EntInterval.Day:
			return addDays(fromDate, intervalCount).getTime();

		// Week (no end-of-month handling needed)
		case BillingInterval.Week:
		case EntInterval.Week:
			return addWeeks(fromDate, intervalCount).getTime();

		// Month-based intervals (with end-of-month preservation)
		case BillingInterval.Month:
		case EntInterval.Month:
			result = new UTCDate(addMonths(fromDate, intervalCount).getTime());
			break;

		case BillingInterval.Quarter:
		case EntInterval.Quarter:
			result = new UTCDate(addMonths(fromDate, 3 * intervalCount).getTime());
			break;

		case BillingInterval.SemiAnnual:
		case EntInterval.SemiAnnual:
			result = new UTCDate(addMonths(fromDate, 6 * intervalCount).getTime());
			break;

		case BillingInterval.Year:
		case EntInterval.Year:
			result = new UTCDate(addYears(fromDate, intervalCount).getTime());
			break;

		// Non-recurring intervals
		case BillingInterval.OneOff:
		case EntInterval.Lifetime:
			return from; // No change for non-recurring

		default:
			throw new Error(`Invalid interval: ${interval}`);
	}

	return result.getTime();
};
