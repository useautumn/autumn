import {
	type CreateScheduleBillingContext,
	ErrCode,
	isPastStartDate,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleSetPlansEndDateErrors = ({
	billingContext,
	endsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	endsAt?: number;
}) => {
	if (endsAt === undefined) return;

	if (isPastStartDate(endsAt, billingContext.currentEpochMs)) {
		throw new RecaseError({
			message:
				"ends_at cannot be set to a past timestamp. Use a future Unix timestamp in milliseconds.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const lastPhase =
		billingContext.futurePhases.at(-1) ?? billingContext.immediatePhase;
	if (endsAt <= lastPhase.starts_at) {
		throw new RecaseError({
			message: "ends_at must be after the last phase starts.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
