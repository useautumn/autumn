import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFutureStartDate,
	isOneOffProduct,
	RecaseError,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { assertFutureBillingCycleAnchor } from "@/internal/billing/v2/common/errors/assertFutureBillingCycleAnchor";

/**
 * Validates billing cycle anchor constraints for attach.
 */
export const handleBillingCycleAnchorErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	const { requestedBillingCycleAnchor } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	assertFutureBillingCycleAnchor({
		requestedBillingCycleAnchor,
		currentEpochMs: billingContext.currentEpochMs,
	});

	const scheduledResetAt =
		typeof requestedBillingCycleAnchor === "number"
			? truncateMsToSecondPrecision(requestedBillingCycleAnchor)
			: undefined;
	const billingStartsAt = billingContext.billingStartsAt;
	if (
		scheduledResetAt !== undefined &&
		billingStartsAt !== undefined &&
		scheduledResetAt <= truncateMsToSecondPrecision(billingStartsAt)
	) {
		throw new RecaseError({
			message: "billing_cycle_anchor must be after the plan starts",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	if (
		scheduledResetAt !== undefined &&
		params.ends_at !== undefined &&
		scheduledResetAt >= truncateMsToSecondPrecision(params.ends_at)
	) {
		throw new RecaseError({
			message: "billing_cycle_anchor must be before ends_at",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	if (
		requestedBillingCycleAnchor === "now" &&
		billingContext.planTiming !== "end_of_cycle" &&
		isFutureStartDate(billingStartsAt, billingContext.currentEpochMs)
	) {
		throw new RecaseError({
			message:
				"billing_cycle_anchor: 'now' cannot be used before the plan starts",
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
	if (isOneOffProduct({ product: billingContext.attachProduct })) {
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
