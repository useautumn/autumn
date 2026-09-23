import {
	type BillingContext,
	ErrCode,
	hasActivePaidSubscription,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";

/** Reject revert trials without an active paid subscription. */
export const handleRevertTrialErrors = ({
	billingContext,
}: {
	billingContext: Pick<BillingContext, "trialContext" | "fullCustomer">;
}) => {
	const { trialContext, fullCustomer } = billingContext;
	if (!isRevertTrialContext({ trialContext })) return;

	if (
		!hasActivePaidSubscription({
			customerProducts: fullCustomer.customer_products,
		})
	) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"Cannot use on_end: 'revert' without an existing paid subscription.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
