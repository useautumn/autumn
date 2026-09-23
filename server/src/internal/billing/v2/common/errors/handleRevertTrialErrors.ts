import {
	type BillingContext,
	ErrCode,
	type FullCusProduct,
	hasActivePaidSubscription,
	isCustomerProductRevertingTrial,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";

const throwRevertTrialError = (message: string) => {
	throw new RecaseError({
		code: ErrCode.InvalidRequest,
		message,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

const handleExistingRevertTrialErrors = ({
	trialContext,
}: Pick<BillingContext, "trialContext">) => {
	if (trialContext?.onEnd === "bill") {
		throwRevertTrialError(
			"Cannot change on_end of a revert trial. Attach the plan with on_end: 'bill' to convert it.",
		);
	}

	if (trialContext?.trialEndsAt === null) {
		throwRevertTrialError(
			"Cannot remove a revert trial. Use cancel_action to end it and restore the previous plan.",
		);
	}
};

export const handleRevertTrialErrors = ({
	billingContext,
	updatedCustomerProduct,
}: {
	billingContext: Pick<BillingContext, "trialContext" | "fullCustomer">;
	updatedCustomerProduct?: FullCusProduct;
}) => {
	const { trialContext, fullCustomer } = billingContext;

	if (isCustomerProductRevertingTrial(updatedCustomerProduct)) {
		handleExistingRevertTrialErrors({ trialContext });
		return;
	}

	if (!isRevertTrialContext({ trialContext })) return;

	if (updatedCustomerProduct) {
		throwRevertTrialError(
			"on_end: 'revert' can only be set when attaching a plan.",
		);
	}

	const hasPaidSubscription = hasActivePaidSubscription({
		customerProducts: fullCustomer.customer_products,
	});
	if (!hasPaidSubscription) {
		throwRevertTrialError(
			"Cannot use on_end: 'revert' without an existing paid subscription.",
		);
	}
};
