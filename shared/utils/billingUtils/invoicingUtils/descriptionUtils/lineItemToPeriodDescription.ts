import type { LineItemContext } from "../../../../models/billingModels/invoicingModels/lineItemContext";
import { formatMsToDate } from "../../../common/formatUtils";

export const lineItemToPeriodDescription = ({
	context,
}: {
	context: LineItemContext;
}): string => {
	const { now, billingPeriod, billingTiming } = context;

	// In-arrear: billing for past usage (start → now)
	// In-advance: billing for future usage (now → end)
	const periodStart = billingTiming === "in_arrear" ? billingPeriod.start : now;
	const periodEnd = billingTiming === "in_arrear" ? now : billingPeriod.end;

	// if (isSameDay(periodStart, periodEnd)) {
	// 	return `from ${formatMs(periodStart, { excludeSeconds: true })} to ${formatMs(periodEnd, { excludeSeconds: true })}`;
	// }

	return `from ${formatMsToDate(periodStart)} to ${formatMsToDate(periodEnd)}`;
};
