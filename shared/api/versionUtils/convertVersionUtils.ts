import { LegacyVersion } from "../../enums/APIVersion.js";
import { ApiVersion } from "./ApiVersion.js";
import { ApiVersionClass } from "./ApiVersionClass.js";
import { VERSION_REGISTRY } from "./versionRegistry.js";
import { CALVER_TO_SEMVER_MAP } from "./versionRegistryUtils.js";

export function calVerToSemVer({
	calver,
}: {
	calver: string;
}): ApiVersion | null {
	return CALVER_TO_SEMVER_MAP[calver] || null;
}

export function semVerToCalVer({ semver }: { semver: ApiVersion }): string {
	const meta = VERSION_REGISTRY[semver];
	if (!meta) {
		throw new Error(`Unknown version: ${semver}`);
	}
	return meta.calver;
}

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

export function parseVersion({
	versionStr,
}: {
	versionStr: string;
}): ApiVersion | null {
	if (/^\d{4}-\d{2}-\d{2}(\.clover)?$/.test(versionStr)) {
		return calVerToSemVer({ calver: versionStr });
	}

	if (/^\d+(\.\d+)*$/.test(versionStr)) {
		const parts = versionStr.split(".");
		const normalizedVersion = `${parts[0] || "0"}.${parts[1] || "0"}.${parts[2] || "0"}`;

		if (Object.values(ApiVersion).includes(normalizedVersion as ApiVersion)) {
			return normalizedVersion as ApiVersion;
		}
	}

	if (Object.values(ApiVersion).includes(versionStr as ApiVersion)) {
		return versionStr as ApiVersion;
	}

	const floatVersion = Number.parseFloat(versionStr);
	if (!Number.isNaN(floatVersion)) {
		return legacyToSemVer({ legacyVersion: floatVersion });
	}

	return null;
}

export function createdAtToVersion({
	createdAt,
}: {
	createdAt?: number;
}): ApiVersionClass {
	const v2_5 = new Date("2026-10-12T00:00:00Z").getTime();
	const v2_4 = new Date("2026-09-04T00:00:00Z").getTime();
	const v2_3 = new Date("2026-05-13T00:00:00Z").getTime();
	const v2_2 = new Date("2026-03-18T00:00:00Z").getTime();

	const v1_2 = new Date("2025-05-05").getTime();
	const v1_1 = new Date("2025-04-17").getTime();
	const v0_2 = new Date("2025-01-30").getTime();

	let version: ApiVersion;

	if (!createdAt || createdAt >= v2_5) {
		version = ApiVersion.V2_5;
	} else if (createdAt >= v2_4) {
		version = ApiVersion.V2_4;
	} else if (createdAt >= v2_3) {
		version = ApiVersion.V2_3;
	} else if (createdAt >= v2_2) {
		version = ApiVersion.V2_2;
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
}
