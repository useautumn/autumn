import { LegacyVersion } from "../../enums/APIVersion.js";
import { ApiVersion } from "./ApiVersion.js";
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
			return ApiVersion.V1_4;
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
		case ApiVersion.V1_4:
			return LegacyVersion.v1_4;
		default:
			return null;
	}
}

/**
 * Parse version string (CalVer, SemVer, or legacy)
 * Supports .clover suffix: "2025-04-17.clover"
 * @example parseVersion({ versionStr: "2025-04-17" }) // ApiVersion.V1_1
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

	// SemVer (X.Y.Z)
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
