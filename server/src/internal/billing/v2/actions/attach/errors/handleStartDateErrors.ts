import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFreeProduct,
	isOneOffProduct,
	ms,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const START_DATE_TOLERANCE_MS = ms.minutes(1);

export const handleStartDateErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	if (params.start_date === undefined) return;

	if (params.start_date < billingContext.currentEpochMs - START_DATE_TOLERANCE_MS) {
		throw new RecaseError({
			message:
				"start_date cannot be set to a past timestamp. Use now or a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (params.plan_schedule === "end_of_cycle") {
		throw new RecaseError({
			message:
				"start_date cannot be used together with plan_schedule: end_of_cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.currentCustomerProduct) {
		throw new RecaseError({
			message:
				"start_date is only supported when attaching a new subscription, not when switching an existing one.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const isFutureStart =
		params.start_date > billingContext.currentEpochMs + START_DATE_TOLERANCE_MS;
	if (!isFutureStart) return;

	const prices = billingContext.attachProduct.prices;
	const isPaidRecurring =
		!isFreeProduct({ prices }) && !isOneOffProduct({ prices });
	if (!isPaidRecurring) {
		throw new RecaseError({
			message: "Future start_date is only supported for paid recurring plans.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!billingContext.paymentMethod) {
		throw new RecaseError({
			message: "Future start_date requires a saved payment method.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message: "Future start_date cannot be used together with a free trial.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
