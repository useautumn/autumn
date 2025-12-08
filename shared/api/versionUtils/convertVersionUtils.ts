import { LegacyVersion } from "../../enums/APIVersion.js";
import { ApiVersion } from "./ApiVersion.js";
import { ApiVersionClass } from "./ApiVersionClass.js";
import { VERSION_REGISTRY } from "./versionRegistry.js";
import { CALVER_TO_SEMVER_MAP } from "./versionRegistryUtils.js";

/**
 * CalVer → SemVer (supports .clover suffix for future non-breaking changes)
 * @example calVerToSemVer({ calver: "2025-04-17" }) // ApiVersion.V1_1
 * @example calVerToSemVer({ calver: "2025-04-17.clover" }) // ApiVersion.V1_1
 */
export function calVerToSemVer({
	calver,
}: {
	calver: string;
}): ApiVersion | null {
	return CALVER_TO_SEMVER_MAP[calver] || null;
}

/**
 * SemVer → CalVer
 * @example semVerToCalVer({ semver: ApiVersion.V1_1 }) // "2025-04-17"
 */
export function semVerToCalVer({ semver }: { semver: ApiVersion }): string {
	const meta = VERSION_REGISTRY[semver];
	if (!meta) {
		throw new Error(`Unknown version: ${semver}`);
	}
	return meta.calver;
}

/**
 * Legacy float → SemVer
 * @example legacyToSemVer({ legacyVersion: 1.1 }) // ApiVersion.V1_1
 */
export function legacyToSemVer({
	legacyVersion,
}: {
	legacyVersion: number;
}): ApiVersion | null {
	switch (legacyVersion) {
		case LegacyVersion.v1:
		case 0.2:
			return ApiVersion.V0_2;
		case 0.1:
			return ApiVersion.V0_1;
		case LegacyVersion.v1_1:
		case 1.1:
			return ApiVersion.V1_1;
		case LegacyVersion.v1_2:
		case 1.2:
			return ApiVersion.V1_2;
		case LegacyVersion.v1_4:
		case 1.4:
			return ApiVersion.V1_Beta;
		default:
			return null;
	}
}

/**
 * SemVer → Legacy float
 * @example semVerToLegacy({ semver: ApiVersion.V1_1 }) // 1.1
 */
export function semVerToLegacy({
	semver,
}: {
	semver: ApiVersion;
}): number | null {
	switch (semver) {
		case ApiVersion.V0_1:
			return 0.1;
		case ApiVersion.V0_2:
			return LegacyVersion.v1;
		case ApiVersion.V1_1:
			return LegacyVersion.v1_1;
		case ApiVersion.V1_2:
			return LegacyVersion.v1_2;
		case ApiVersion.V1_Beta:
			return LegacyVersion.v1_4;
		default:
			return null;
	}
}

/**
 * Parse version string (CalVer, SemVer, or legacy)
 * Supports .clover suffix: "2025-04-17.clover"
 * Supports partial SemVer: "2" → "2.0.0", "2.0" → "2.0.0"
 * @example parseVersion({ versionStr: "2025-04-17" }) // ApiVersion.V1_1
 * @example parseVersion({ versionStr: "2" }) // ApiVersion.V2_0
 * @example parseVersion({ versionStr: "2.0" }) // ApiVersion.V2_0
 */
export function parseVersion({
	versionStr,
}: {
	versionStr: string;
}): ApiVersion | null {
	// CalVer with optional .clover suffix
	if (/^\d{4}-\d{2}-\d{2}(\.clover)?$/.test(versionStr)) {
		return calVerToSemVer({ calver: versionStr });
	}

	// SemVer (X.Y.Z) - normalize partial versions
	// Supports "2" → "2.0.0", "2.0" → "2.0.0", "2.0.0" → "2.0.0"
	if (/^\d+(\.\d+)*$/.test(versionStr)) {
		const parts = versionStr.split(".");
		const normalizedVersion = `${parts[0] || "0"}.${parts[1] || "0"}.${parts[2] || "0"}`;

		if (Object.values(ApiVersion).includes(normalizedVersion as ApiVersion)) {
			return normalizedVersion as ApiVersion;
		}
	}

	// Check for exact match (for special versions like "beta")
	if (Object.values(ApiVersion).includes(versionStr as ApiVersion)) {
		return versionStr as ApiVersion;
	}

	// Legacy float
	const floatVersion = Number.parseFloat(versionStr);
	if (!Number.isNaN(floatVersion)) {
		return legacyToSemVer({ legacyVersion: floatVersion });
	}

	return null;
}

/**
 * Convert Unix timestamp (milliseconds since epoch) to ApiVersionClass
 * Based on organization creation date - returns ApiVersionClass with comparison methods
 * @example createdAtToVersion({ createdAt: 1706572800000 }) // ApiVersionClass(V0_2)
 * @example createdAtToVersion({ createdAt: Date.now() }).gte(ApiVersion.V1_1) // true
 * @example createdAtToVersion({ createdAt: Date.now() }).value // Get raw ApiVersion enum
 */
export function createdAtToVersion({
	createdAt,
}: {
	createdAt?: number;
}): ApiVersionClass {
	const v2_0 = new Date("2026-03-31").getTime();
	const v1_2 = new Date("2025-05-05").getTime();
	const v1_1 = new Date("2025-04-17").getTime();
	const v0_2 = new Date("2025-01-30").getTime();

	let version: ApiVersion;

	if (!createdAt || createdAt >= v2_0) {
		version = ApiVersion.V2_0;
	} else if (createdAt >= v1_2) {
		version = ApiVersion.V1_2;
	} else if (createdAt >= v1_1) {
		version = ApiVersion.V1_1;
	} else if (createdAt >= v0_2) {
		version = ApiVersion.V0_2;
	} else {
		version = ApiVersion.V0_1;
	}

	return new ApiVersionClass(version);
	// return new ApiVersionClass(ApiVersion.V2_0);
}

// Convert org creation date
