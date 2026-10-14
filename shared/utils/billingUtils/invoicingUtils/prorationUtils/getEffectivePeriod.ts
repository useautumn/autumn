import type { BillingPeriod } from "../../../../models/billingModels/lineItem/lineItemContext";

export const getEffectivePeriod = ({
	now,
	billingPeriod,
	billingTiming,
	startFloor,
}: {
	now: number;
	billingPeriod: BillingPeriod;
	billingTiming: "in_arrear" | "in_advance";
	startFloor?: number;
}): BillingPeriod => {
	if (billingTiming === "in_arrear") {
		const start =
			startFloor === undefined
				? billingPeriod.start
				: Math.max(billingPeriod.start, startFloor);
		return { start, end: now };
	}
	return { start: now, end: billingPeriod.end };
};
