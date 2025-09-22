import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import { differenceInMonths, differenceInYears } from "date-fns";
import { StatusCodes } from "http-status-codes";

export const getEventTimestamp = (timestamp?: number | null) => {
	// 1. If timestamp is not provided, return now
	if (!timestamp) {
		return new Date();
	}

	try {
		let date = new Date(timestamp);

		if (differenceInYears(new Date(), date) >= 2) {
			throw new RecaseError({
				message: "Timestamp must be within the last 2 years",
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		} else if (differenceInMonths(new Date(), date) <= -1) {
			throw new RecaseError({
				message: "Timestamp can only be up to 1 month in the future",
				code: ErrCode.InvalidInputs,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		return date;
	} catch (error) {
		if (error instanceof RecaseError) {
			throw error;
		}

		throw new RecaseError({
			message: "Invalid timestamp",
			code: ErrCode.InvalidInputs,
			data: error,
		});
	}
};
