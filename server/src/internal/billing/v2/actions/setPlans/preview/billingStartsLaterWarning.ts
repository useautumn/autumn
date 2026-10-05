import {
	type BillingContext,
	boldText,
	formatMsToDate,
	type LineItem,
	plainText,
	type SetPlansPreviewWarning,
} from "@autumn/shared";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import { warningText } from "./warningText";

const chargesNow = (lineItems: LineItem[]) =>
	lineItems.some(
		(lineItem) =>
			lineItem.chargeImmediately && lineItem.amountAfterDiscounts > 0,
	);

/** A later first phase bills from its start, and early access opens the plans before then. */
export const billingStartsLaterWarning = ({
	billingContext,
	lineItems,
}: {
	billingContext: Pick<
		BillingContext,
		"currentEpochMs" | "billingStartsAt" | "accessStartsAt"
	>;
	lineItems: LineItem[];
}): Omit<SetPlansPreviewWarning, "severity"> | undefined => {
	const { billingStartsAt, accessStartsAt, currentEpochMs } = billingContext;
	if (billingStartsAt === undefined) return undefined;
	if (
		classifyFirstPhaseStart({ startsAt: billingStartsAt, currentEpochMs }) !==
		"future"
	) {
		return undefined;
	}

	const billingStart = chargesNow(lineItems)
		? [
				plainText(
					"Ongoing plans are billed now. Billing for the other plans starts on",
				),
				boldText(`${formatMsToDate(billingStartsAt)}.`),
			]
		: [
				plainText("Billing starts on"),
				boldText(`${formatMsToDate(billingStartsAt)},`),
				plainText("when the first invoice is sent."),
			];
	return {
		type: "billing_starts_later",
		...warningText([
			...(accessStartsAt === undefined
				? []
				: [plainText("Access starts now.")]),
			...billingStart,
		]),
	};
};
