import { UTCDate } from "@date-fns/utc";
import { addMonths, addWeeks, addYears } from "date-fns";
import { BillingInterval } from "../../models/productModels/intervals/billingInterval";
import type { IntervalConfig } from "../intervalUtils";

// Validate unix timestamp

export const addBillingInterval = ({
	fromUnix,
	intervalConfig,
}: {
	fromUnix: number;
	intervalConfig: IntervalConfig;
}) => {
	const { interval, intervalCount = 1 } = intervalConfig;
	const fromDate = new UTCDate(fromUnix);

	switch (interval) {
		case BillingInterval.Week:
			return addWeeks(fromDate, 1 * intervalCount).getTime();
		case BillingInterval.Month:
			return addMonths(fromDate, intervalCount).getTime();
		case BillingInterval.Quarter:
			return addMonths(fromDate, 3 * intervalCount).getTime();
		case BillingInterval.SemiAnnual:
			return addMonths(fromDate, 6 * intervalCount).getTime();
		case BillingInterval.Year:
			return addYears(fromDate, 1 * intervalCount).getTime();
		default:
			throw new Error(`Invalid billing interval: ${interval}`);
	}
};
