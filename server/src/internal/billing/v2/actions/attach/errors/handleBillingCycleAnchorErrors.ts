import {
	type AttachBillingContext,
	ErrCode,
	isOneOffProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates billing cycle anchor constraints for attach.
 */
export const handleBillingCycleAnchorErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	// Past timestamps are not allowed
	if (
		typeof requestedBillingCycleAnchor === "number" &&
		requestedBillingCycleAnchor < billingContext.currentEpochMs
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be set to a past timestamp. Use 'now' or a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Cannot combine billing_cycle_anchor with a trial
	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor cannot be used together with a free trial. The trial already controls the billing cycle start.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Cannot use billing_cycle_anchor on one-off products
	if (isOneOffProduct({ prices: billingContext.attachProduct.prices })) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor is not supported for one-off products. One-off products do not have a recurring billing cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	// Resets are not supported for scheduled switches (downgrades)
	if (
		requestedBillingCycleAnchor === "now" &&
		billingContext.planTiming === "end_of_cycle"
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor resets are not supported for scheduled switches. Use an immediate upgrade, or remove billing_cycle_anchor.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
