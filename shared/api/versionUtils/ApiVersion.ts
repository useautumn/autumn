/**
 * API Version enum (SemVer format, descending order)
 * Users send CalVer in x-api-version header (e.g., "2025-04-17")
 * Internally we use SemVer for comparison (e.g., "1.1.0")
 */
export enum ApiVersion {
	V1_4 = "1.4.0",
	V1_2 = "1.2.0",
	V1_1 = "1.1.0",
	V0_2 = "0.2.0",
	V0_1 = "0.1.0",
}

export type ApiVersionString = `${ApiVersion}`;

export const API_VERSIONS = Object.values(ApiVersion);

export const LATEST_VERSION = ApiVersion.V1_2;
