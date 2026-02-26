import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Throws SERVICE_UNAVAILABLE if Tinybird is not configured. */
export const assertTinybirdAvailable = () => {
	if (!process.env.TINYBIRD_TOKEN) {
		throw new RecaseError({
			message: "Tinybird is not configured, cannot fetch analytics",
			code: ErrCode.TinybirdDisabled,
			statusCode: StatusCodes.SERVICE_UNAVAILABLE,
		});
	}
};
