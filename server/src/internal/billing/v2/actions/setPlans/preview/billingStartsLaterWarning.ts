import {
	type BillingContext,
	boldText,
	formatMsToDate,
	plainText,
	type SetPlansPreviewWarning,
} from "@autumn/shared";
import { classifyFirstPhaseStart } from "../setup/classifyFirstPhaseStart";
import { warningText } from "./warningText";

/** A later first phase bills from its start, and early access opens the plans before then. */
export const billingStartsLaterWarning = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"currentEpochMs" | "billingStartsAt" | "accessStartsAt"
	>;
}): Omit<SetPlansPreviewWarning, "severity"> | undefined => {
	const { billingStartsAt, accessStartsAt, currentEpochMs } = billingContext;
	if (billingStartsAt === undefined) return undefined;
	if (
		classifyFirstPhaseStart({ startsAt: billingStartsAt, currentEpochMs }) !==
		"future"
	) {
		return undefined;
	}

	return {
		type: "billing_starts_later",
		...warningText([
			...(accessStartsAt === undefined
				? []
				: [plainText("Access starts now.")]),
			plainText("Billing starts on"),
			boldText(`${formatMsToDate(billingStartsAt)},`),
			plainText("when the first invoice is sent."),
		]),
	};
};
