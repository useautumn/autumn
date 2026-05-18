import { createTinybirdApi } from "@tinybirdco/sdk";

// During the us-west → us-east cutover, the primary (TINYBIRD_API_URL) flips
// to us-east and this secondary client points at us-west as a safety-net
// dual-write target. TINYBIRD_US_EAST_* is kept as a fallback so deploys can
// land before Infisical is updated; remove the fallback once the cutover is
// stable and us-west is fully decommissioned.
const normalize = (value: string | undefined): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
};

const secondaryUrl = normalize(process.env.TINYBIRD_SECONDARY_API_URL);
const secondaryToken = normalize(process.env.TINYBIRD_SECONDARY_TOKEN);
const legacyUrl = normalize(process.env.TINYBIRD_US_EAST_API_URL);
const legacyToken = normalize(process.env.TINYBIRD_US_EAST_TOKEN);

// Pair-level config: both vars in a pair must be set together, never one of
// each. Per-field `??` fallback would happily mix a us-west URL with a us-east
// token. Refuse to start instead.
if (Boolean(secondaryUrl) !== Boolean(secondaryToken)) {
	throw new Error(
		"TINYBIRD_SECONDARY_API_URL and TINYBIRD_SECONDARY_TOKEN must both be set or both unset.",
	);
}
if (Boolean(legacyUrl) !== Boolean(legacyToken)) {
	throw new Error(
		"TINYBIRD_US_EAST_API_URL and TINYBIRD_US_EAST_TOKEN must both be set or both unset.",
	);
}

const secondaryConfig =
	secondaryUrl && secondaryToken
		? { baseUrl: secondaryUrl, token: secondaryToken }
		: legacyUrl && legacyToken
			? { baseUrl: legacyUrl, token: legacyToken }
			: null;

/** Secondary Tinybird API client for dual-write safety net during region cutover. */
export const tinybirdSecondaryApi = secondaryConfig
	? createTinybirdApi(secondaryConfig)
	: null;

const safeOrigin = (url: string): string | null => {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
};

if (secondaryConfig) {
	const primaryUrl = normalize(process.env.TINYBIRD_API_URL);
	const primaryOrigin = primaryUrl ? safeOrigin(primaryUrl) : null;
	const secondaryOrigin = safeOrigin(secondaryConfig.baseUrl);
	if (primaryOrigin && secondaryOrigin && primaryOrigin === secondaryOrigin) {
		console.warn(
			`[Tinybird] WARNING: primary and secondary resolve to the same workspace (${primaryOrigin}). ` +
				"The events datasource is plain MergeTree with no dedup, so each ingest " +
				"will write the same row twice. Verify Infisical TINYBIRD_API_URL vs TINYBIRD_SECONDARY_API_URL.",
		);
	}
	console.log(
		`[Tinybird] secondary dual-write configured with URL: ${secondaryConfig.baseUrl}`,
	);
}
