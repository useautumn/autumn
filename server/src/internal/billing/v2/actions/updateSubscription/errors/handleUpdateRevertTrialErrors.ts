import {
	ErrCode,
	isCustomerProductRevertingTrial,
	RecaseError,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";

const throwInvalidRequest = (message: string) => {
	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

export const handleUpdateRevertTrialErrors = ({
	billingContext,
}: {
	billingContext: Pick<
		UpdateSubscriptionBillingContext,
		"trialContext" | "customerProduct"
	>;
}) => {
	const { trialContext, customerProduct } = billingContext;
	const isCurrentlyRevertTrial =
		isCustomerProductRevertingTrial(customerProduct);

	if (!isCurrentlyRevertTrial && isRevertTrialContext({ trialContext })) {
		throwInvalidRequest(
			"on_end: 'revert' can only be set when attaching a plan.",
		);
	}

	if (!isCurrentlyRevertTrial) return;

	if (trialContext?.onEnd === "bill") {
		throwInvalidRequest(
			"Cannot change on_end of a revert trial. Attach the plan with on_end: 'bill' to convert it.",
		);
	}

	if (trialContext?.trialEndsAt === null) {
		throwInvalidRequest(
			"Cannot remove a revert trial. Use cancel_action to end it and restore the previous plan.",
		);
	}
};
