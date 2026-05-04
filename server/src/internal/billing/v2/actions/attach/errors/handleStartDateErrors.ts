import {
	ACTIVE_STATUSES,
	type AttachBillingContext,
	type AttachParamsV1,
	CusProductStatus,
	cusProductToPrices,
	ErrCode,
	isFreeProduct,
	isOneOffProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	isFutureStartDate,
	isPastStartDate,
} from "@/internal/billing/v2/utils/startDateUtils";

const hasActivePaidRecurringSubscription = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) =>
	billingContext.fullCustomer.customer_products.some((customerProduct) => {
		const hasActiveOrTrialingStatus =
			ACTIVE_STATUSES.includes(customerProduct.status) ||
			customerProduct.status === CusProductStatus.Trialing;

		if (!hasActiveOrTrialingStatus) return false;
		if (!customerProduct.subscription_ids?.length) return false;

		const prices = cusProductToPrices({ cusProduct: customerProduct });
		return !isFreeProduct({ prices }) && !isOneOffProduct({ prices });
	});

export const handleStartDateErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	if (params.start_date === undefined) return;

	if (isPastStartDate(params.start_date, billingContext.currentEpochMs)) {
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

	if (
		!isFutureStartDate(params.start_date, billingContext.currentEpochMs)
	) {
		return;
	}

	if (params.invoice_mode?.enabled) {
		throw new RecaseError({
			message: "Future start_date cannot be used together with invoice mode.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (hasActivePaidRecurringSubscription({ billingContext })) {
		throw new RecaseError({
			message:
				"Future start_date is only supported when the customer has no active paid subscription.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

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
