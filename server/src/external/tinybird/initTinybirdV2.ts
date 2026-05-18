import { createTinybirdApi } from "@tinybirdco/sdk";

// Dual-write safety net during the us-east cutover. Reads the legacy
// us-west env vars; delete with the dual-write logic in `sendEvents.ts`
// once us-east is stable.
const secondaryApiUrl = process.env.TINYBIRD_API_URL;
const secondaryToken = process.env.TINYBIRD_TOKEN;

const secondaryConfig =
	secondaryApiUrl && secondaryToken
		? { baseUrl: secondaryApiUrl, token: secondaryToken }
		: null;

export const tinybirdSecondaryApi = secondaryConfig
	? createTinybirdApi(secondaryConfig)
	: null;

if (secondaryConfig) {
	console.log(
		`[Tinybird] secondary dual-write configured with URL: ${secondaryConfig.baseUrl}`,
	);
}
