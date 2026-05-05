import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFreeProduct,
	isFutureStartDate,
	isOneOffProduct,
	isPastStartDate,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleStartDateErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	if (params.starts_at === undefined) return;

	if (isPastStartDate(params.starts_at, billingContext.currentEpochMs)) {
		throw new RecaseError({
			message:
				"starts_at cannot be set to a past timestamp. Use now or a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (params.plan_schedule === "end_of_cycle") {
		throw new RecaseError({
			message:
				"starts_at cannot be used together with plan_schedule: end_of_cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!isFutureStartDate(params.starts_at, billingContext.currentEpochMs)) {
		return;
	}

	if (params.invoice_mode?.enabled) {
		throw new RecaseError({
			message: "Future starts_at cannot be used together with invoice mode.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const prices = billingContext.attachProduct.prices;
	const isPaidRecurring =
		!isFreeProduct({ prices }) && !isOneOffProduct({ prices });
	if (!isPaidRecurring) {
		throw new RecaseError({
			message: "Future starts_at is only supported for paid recurring plans.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message: "Future starts_at cannot be used together with a free trial.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
