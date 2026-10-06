import {
	ErrCode,
	RecaseError,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Invoice mode for a no-card trial Autumn runs is chosen at attach, where the intent is stored on the trial. */
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
			"Cannot set invoice mode when updating a no-card free trial (card_required: false). Set invoice mode when attaching the trial to invoice the customer when it ends, or require a card for the trial.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
