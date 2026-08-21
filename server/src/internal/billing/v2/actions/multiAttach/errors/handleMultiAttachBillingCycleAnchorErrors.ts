import {
	ErrCode,
	isFutureStartDate,
	isOneOffProduct,
	type MultiAttachBillingContext,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleMultiAttachBillingCycleAnchorErrors = ({
	billingContext,
}: {
	billingContext: MultiAttachBillingContext;
}) => {
	if (billingContext.requestedBillingCycleAnchor === undefined) return;

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be used together with a free trial. The trial already controls the billing cycle start.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (
		billingContext.fullProducts.every((product) => isOneOffProduct({ product }))
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor is not supported when every plan is one-off. One-off plans do not have a recurring billing cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (
		isFutureStartDate(
			billingContext.billingStartsAt,
			billingContext.currentEpochMs,
		)
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor: 'now' cannot be used before the plans start",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
