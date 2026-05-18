import { createTinybirdApi } from "@tinybirdco/sdk";

/**
 * Secondary Tinybird API client for dual-write safety net during the
 * us-west → us-east region cutover. Reads from the legacy `TINYBIRD_API_URL`
 * / `TINYBIRD_TOKEN` env vars, which point at us-west during the transition.
 * Primary lives on `TINYBIRD_US_EAST_*` (see `tinybirdUtils.ts`). Once
 * us-east is stable, delete this file + the dual-write logic in
 * `sendEvents.ts`, and remove `TINYBIRD_API_URL` / `TINYBIRD_TOKEN` from
 * Infisical.
 */
const TINYBIRD_SECONDARY_API_URL = process.env.TINYBIRD_API_URL;
const TINYBIRD_SECONDARY_TOKEN = process.env.TINYBIRD_TOKEN;

const secondaryConfig =
	TINYBIRD_SECONDARY_API_URL && TINYBIRD_SECONDARY_TOKEN
		? { baseUrl: TINYBIRD_SECONDARY_API_URL, token: TINYBIRD_SECONDARY_TOKEN }
		: null;

const safeOrigin = (url: string): string | null => {
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
};

/** Secondary Tinybird API client for dual-write safety net during region cutover. */
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
