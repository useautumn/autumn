import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

// Primary points at us-east during the cutover; legacy us-west vars feed
// the dual-write secondary in `initTinybirdV2.ts`.
const primaryApiUrl = process.env.TINYBIRD_US_EAST_API_URL;
const primaryToken = process.env.TINYBIRD_US_EAST_TOKEN;

export type TinybirdConfig = {
	baseUrl: string;
	token: string;
};

export const tinybirdConfig: TinybirdConfig | null =
	primaryApiUrl && primaryToken
		? {
				baseUrl: primaryApiUrl,
				token: primaryToken,
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
