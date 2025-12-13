import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { EntInterval } from "@models/productModels/intervals/entitlementInterval";
import {
	addDays,
	addHours,
	addMinutes,
	addMonths,
	addWeeks,
	addYears,
	differenceInDays,
	differenceInHours,
	differenceInMinutes,
	differenceInMonths,
	differenceInWeeks,
	differenceInYears,
} from "date-fns";

export type IntervalFns = {
	add: (date: Date, amount: number) => Date;
	difference: (later: Date, earlier: Date) => number;
};

/**
 * Maps an interval type to its corresponding date-fns add/difference functions.
 * Returns null for non-recurring intervals (OneOff, Lifetime).
 */
export const getCycleIntervalFunctions = ({
	interval,
}: {
	interval: BillingInterval | EntInterval;
}): IntervalFns | null => {
	switch (interval) {
		// Non-recurring intervals
		case BillingInterval.OneOff:
		case EntInterval.Lifetime:
			return null;

		// Fine-grained intervals (EntInterval only) [minute is deprecated]
		case EntInterval.Minute:
			return { add: addMinutes, difference: differenceInMinutes };

		case EntInterval.Hour:
			return { add: addHours, difference: differenceInHours };

		case EntInterval.Day:
			return { add: addDays, difference: differenceInDays };

		// Shared intervals
		case BillingInterval.Week:
		case EntInterval.Week:
			return { add: addWeeks, difference: differenceInWeeks };

		case BillingInterval.Month:
		case EntInterval.Month:
			return { add: addMonths, difference: differenceInMonths };

		case BillingInterval.Quarter:
		case EntInterval.Quarter:
			return {
				add: (date, amount) => addMonths(date, amount * 3),
				difference: (later, earlier) =>
					Math.floor(differenceInMonths(later, earlier) / 3),
			};

		case BillingInterval.SemiAnnual:
		case EntInterval.SemiAnnual:
			return {
				add: (date, amount) => addMonths(date, amount * 6),
				difference: (later, earlier) =>
					Math.floor(differenceInMonths(later, earlier) / 6),
			};

		case BillingInterval.Year:
		case EntInterval.Year:
			return { add: addYears, difference: differenceInYears };

		default: {
			const exhaustiveCheck: never = interval;
			throw new Error(`Unknown interval: ${exhaustiveCheck}`);
		}
	}
};
