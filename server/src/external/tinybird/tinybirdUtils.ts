import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const TINYBIRD_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

export type TinybirdConfig = {
	baseUrl: string;
	token: string;
};

export const tinybirdConfig: TinybirdConfig | null =
	TINYBIRD_API_URL && TINYBIRD_TOKEN
		? {
				baseUrl: TINYBIRD_API_URL,
				token: TINYBIRD_TOKEN,
			}
		: null;

/** Check if Tinybird is configured. */
export const isTinybirdConfigured = (): boolean => tinybirdConfig !== null;

/** Throws SERVICE_UNAVAILABLE if Tinybird is not configured. */
export const assertTinybirdAvailable = () => {
	if (!isTinybirdConfigured()) {
		throw new RecaseError({
			message: "Tinybird is not configured, cannot fetch analytics",
			code: ErrCode.TinybirdDisabled,
			statusCode: StatusCodes.SERVICE_UNAVAILABLE,
		});
	}
};
