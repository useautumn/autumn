import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import { formatMsToDate } from "../../../common/formatUtils";

/**
 * Generates a human-readable period description for a line item.
 *
 * Uses `effectivePeriod` if available (computed in buildLineItem),
 * otherwise falls back to computing from billingPeriod + now + billingTiming.
 */
export const lineItemToPeriodDescription = ({
	context,
}: {
	context: LineItemContext;
}): string => {
	const { effectivePeriod, billingPeriod, now, billingTiming } = context;

	// Prefer effectivePeriod if available
	if (effectivePeriod) {
		return `from ${formatMsToDate(effectivePeriod.start)} to ${formatMsToDate(effectivePeriod.end)}`;
	}

	// Fallback: compute from billingPeriod (for backwards compatibility)
	if (!billingPeriod) return "";

	// In-arrear: billing for past usage (start → now)
	// In-advance: billing for future usage (now → end)
	const periodStart = billingTiming === "in_arrear" ? billingPeriod.start : now;
	const periodEnd = billingTiming === "in_arrear" ? now : billingPeriod.end;

	return `from ${formatMsToDate(periodStart)} to ${formatMsToDate(periodEnd)}`;
};
