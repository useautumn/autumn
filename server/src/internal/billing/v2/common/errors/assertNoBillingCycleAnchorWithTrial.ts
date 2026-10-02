import { type BillingContext, ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const assertNoBillingCycleAnchorWithTrial = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"requestedBillingCycleAnchor" | "trialContext"
	>;
}) => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return;
	if (!billingContext.trialContext?.trialEndsAt) return;

	throw new RecaseError({
		message:
			"billing_cycle_anchor cannot be used together with a free trial. The trial already controls the billing cycle start.",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
