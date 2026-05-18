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

const safeOrigin = (url: string): string | null => {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
};

export const tinybirdSecondaryApi = secondaryConfig
	? createTinybirdApi(secondaryConfig)
	: null;

if (secondaryConfig) {
	const primaryUrl = process.env.TINYBIRD_US_EAST_API_URL;
	const primaryOrigin = primaryUrl ? safeOrigin(primaryUrl) : null;
	const secondaryOrigin = safeOrigin(secondaryConfig.baseUrl);
	if (primaryOrigin && secondaryOrigin && primaryOrigin === secondaryOrigin) {
		console.warn(
			`[Tinybird] WARNING: primary and secondary resolve to the same workspace (${primaryOrigin}). ` +
				"The events datasource is plain MergeTree with no dedup, so each ingest " +
				"will write the same row twice. Verify Infisical TINYBIRD_US_EAST_API_URL vs TINYBIRD_API_URL.",
		);
	}
	console.log(
		`[Tinybird] secondary dual-write configured with URL: ${secondaryConfig.baseUrl}`,
	);
}
