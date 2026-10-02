import {
	boldText,
	formatAmount,
	formatMsToDate,
	type LineItem,
	plainText,
	type SetPlansPreviewWarning,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { warningText } from "./warningText";

/** Arrear usage on the cancelled subscription is dropped, so the preview shows what is lost. */
export const unbilledUsageWarnings = (
	lineItems: LineItem[],
): Omit<SetPlansPreviewWarning, "severity">[] => {
	const [first] = lineItems;
	const total = lineItems
		.reduce((sum, lineItem) => sum.plus(lineItem.amount), new Decimal(0))
		.toNumber();
	if (!first || total <= 0) return [];

	const sinceMs = Math.min(
		...lineItems.map(
			(lineItem) =>
				lineItem.context.effectivePeriod?.start ??
				lineItem.context.billingPeriod?.start ??
				lineItem.context.now,
		),
	);

	return [
		{
			type: "usage_not_billed",
			...warningText([
				boldText(
					formatAmount({ currency: first.context.currency, amount: total }),
				),
				plainText("of usage since"),
				boldText(formatMsToDate(sinceMs)),
				plainText("is not billed."),
			]),
		},
	];
};
