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

type Interval = BillingInterval | EntInterval;

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
		case EntInterval.Minute:
			return addMinutes(fromDate, intervalCount).getTime();
		case EntInterval.Hour:
			return addHours(fromDate, intervalCount).getTime();
		case EntInterval.Day:
			return addDays(fromDate, intervalCount).getTime();

		case BillingInterval.Week:
		case EntInterval.Week:
			return addWeeks(fromDate, intervalCount).getTime();

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

		case BillingInterval.OneOff:
		case EntInterval.Lifetime:
			return from;

		default:
			throw new Error(`Invalid interval: ${interval}`);
	}

	return result.getTime();
};
