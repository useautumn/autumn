import {
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Mirrors attach: a no-card trial Autumn runs can't also be billed through invoice mode. */
export const handleAutumnManagedTrialInvoiceModeErrors = ({
	billingContext,
}: {
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const { invoiceMode, trialContext } = billingContext;
	if (!invoiceMode || !trialContext?.autumnManaged) return;
	if (trialContext.cardRequired !== false || trialContext.onEnd === "revert")
		return;

	throw new RecaseError({
		message:
			"Cannot use invoice mode with a no-card free trial (card_required: false). Either require a card for the trial, or drop invoice mode.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
