import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFreeProduct,
	isPastStartDate,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleEndDateErrors = ({
	billingContext,
	params,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
}) => {
	if (params.ends_at === undefined) return;

	if (isPastStartDate(params.ends_at, billingContext.currentEpochMs)) {
		throw new RecaseError({
			message:
				"ends_at cannot be set to a past timestamp. Use a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const startsAt =
		params.starts_at ??
		(billingContext.planTiming === "end_of_cycle"
			? billingContext.endOfCycleMs
			: billingContext.currentEpochMs);
	if (startsAt !== undefined && params.ends_at <= startsAt) {
		throw new RecaseError({
			message: "ends_at must be after the plan start timestamp.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (isFreeProduct({ product: billingContext.attachProduct })) {
		throw new RecaseError({
			message: "ends_at is only supported for paid plans.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
