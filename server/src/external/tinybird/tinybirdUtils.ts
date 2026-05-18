import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Primary Tinybird config — reads from `TINYBIRD_US_EAST_API_URL` /
 * `TINYBIRD_US_EAST_TOKEN` during the us-west → us-east cutover transition.
 * The legacy `TINYBIRD_API_URL` / `TINYBIRD_TOKEN` env vars now feed the
 * dual-write *secondary* client (`initTinybirdSecondary.ts`) as a safety net
 * during the transition. After cutover stabilises, the secondary client and
 * legacy env vars get removed in a follow-up cleanup.
 */
const TINYBIRD_PRIMARY_API_URL = process.env.TINYBIRD_US_EAST_API_URL;
const TINYBIRD_PRIMARY_TOKEN = process.env.TINYBIRD_US_EAST_TOKEN;

export type TinybirdConfig = {
	baseUrl: string;
	token: string;
};

export const tinybirdConfig: TinybirdConfig | null =
	TINYBIRD_PRIMARY_API_URL && TINYBIRD_PRIMARY_TOKEN
		? {
				baseUrl: TINYBIRD_PRIMARY_API_URL,
				token: TINYBIRD_PRIMARY_TOKEN,
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
