import { createTinybirdApi } from "@tinybirdco/sdk";

// Dual-write safety net during the us-east cutover. Reads the legacy
// us-west env vars; delete with the dual-write logic in `sendEvents.ts`
// once us-east is stable.
const TINYBIRD_API_URL = process.env.TINYBIRD_API_URL;
const TINYBIRD_TOKEN = process.env.TINYBIRD_TOKEN;

/** Secondary Tinybird API client for dual-write during region cutover. */
export const tinybirdSecondaryApi =
	TINYBIRD_API_URL && TINYBIRD_TOKEN
		? createTinybirdApi({ baseUrl: TINYBIRD_API_URL, token: TINYBIRD_TOKEN })
		: null;

if (tinybirdSecondaryApi) {
	console.log(
		`[Tinybird] secondary dual-write configured with URL: ${TINYBIRD_API_URL}`,
	);
}
