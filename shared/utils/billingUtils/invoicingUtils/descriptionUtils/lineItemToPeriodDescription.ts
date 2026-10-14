import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { formatMsToDate } from "../../../common/formatUtils";

export const lineItemToPeriodDescription = ({
	context,
}: {
	context: LineItemContext;
}): string => {
	const { effectivePeriod, billingPeriod, now, billingTiming } = context;

	if (effectivePeriod) {
		return `from ${formatMsToDate(effectivePeriod.start)} to ${formatMsToDate(effectivePeriod.end)}`;
	}

	if (!billingPeriod) return "";

	const periodStart = billingTiming === "in_arrear" ? billingPeriod.start : now;
	const periodEnd = billingTiming === "in_arrear" ? now : billingPeriod.end;

	return `from ${formatMsToDate(periodStart)} to ${formatMsToDate(periodEnd)}`;
};
