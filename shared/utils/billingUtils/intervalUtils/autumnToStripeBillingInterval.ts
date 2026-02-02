import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import type Stripe from "stripe";

export const autumnToStripeBillingInterval = ({
	interval,
	intervalCount,
}: {
	interval: BillingInterval;
	intervalCount?: number;
}):
	| {
			interval: Stripe.PriceCreateParams.Recurring.Interval;
			interval_count: number;
	  }
	| undefined => {
	const finalCount = intervalCount ?? 1;
	switch (interval) {
		case BillingInterval.Week:
			return {
				interval: "week",
				interval_count: finalCount,
			};
		case BillingInterval.Month:
			return {
				interval: "month",
				interval_count: finalCount,
			};
		case BillingInterval.Quarter:
			return {
				interval: "month",
				interval_count: finalCount * 3,
			};
		case BillingInterval.SemiAnnual:
			return {
				interval: "month",
				interval_count: finalCount * 6,
			};
		case BillingInterval.Year:
			return {
				interval: "year",
				interval_count: finalCount,
			};
		default:
			return undefined;
	}
};
