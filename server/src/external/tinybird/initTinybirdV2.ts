import { createTinybirdApi } from "@tinybirdco/sdk";

const TINYBIRD_SECONDARY_API_URL = process.env.TINYBIRD_API_URL;
const TINYBIRD_SECONDARY_TOKEN = process.env.TINYBIRD_TOKEN;

/** Secondary Tinybird API client for dual-write safety net during region cutover.
 *  Reads from the legacy TINYBIRD_API_URL / TINYBIRD_TOKEN env vars, which point
 *  at the prior region (us-west). Once us-east is stable, delete this file +
 *  the dual-write logic in sendEvents.ts. */
export const tinybirdSecondaryApi =
	TINYBIRD_SECONDARY_API_URL && TINYBIRD_SECONDARY_TOKEN
		? createTinybirdApi({
				baseUrl: TINYBIRD_SECONDARY_API_URL,
				token: TINYBIRD_SECONDARY_TOKEN,
			})
		: null;

if (tinybirdSecondaryApi) {
	console.log(
		`[Tinybird] secondary dual-write configured with URL: ${TINYBIRD_SECONDARY_API_URL}`,
	);
}
