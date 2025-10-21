import { API_VERSIONS, type ApiVersion } from "./ApiVersion.js";
import { VERSION_REGISTRY, type VersionMetadata } from "./versionRegistry.js";

/**
 * CalVer → SemVer lookup map
 */
export const CALVER_TO_SEMVER_MAP: Record<string, ApiVersion> = Object.values(
	VERSION_REGISTRY,
).reduce(
	(acc, meta) => {
		acc[meta.calver] = meta.semver;
		// Support .clover suffix for future non-breaking changes
		acc[`${meta.calver}.clover`] = meta.semver;
		return acc;
	},
	{} as Record<string, ApiVersion>,
);

export function getVersionMetadata({
	version,
}: {
	version: ApiVersion;
}): VersionMetadata {
	return VERSION_REGISTRY[version];
}

export function isValidVersion(params: {
	version: string;
}): params is { version: ApiVersion } {
	return API_VERSIONS.includes(params.version as ApiVersion);
}

export function getVersionsSorted(): ApiVersion[] {
	return Object.values(VERSION_REGISTRY)
		.sort((a, b) => a.releasedAt - b.releasedAt)
		.map((meta) => meta.semver);
}

export function getVersionsBetween({
	from,
	to,
}: {
	from: ApiVersion;
	to: ApiVersion;
}): ApiVersion[] {
	const sorted = getVersionsSorted();
	const fromIndex = sorted.indexOf(from);
	const toIndex = sorted.indexOf(to);

	if (fromIndex === -1 || toIndex === -1) {
		throw new Error(`Invalid version range: ${from} to ${to}`);
	}

	return sorted.slice(fromIndex, toIndex + 1);
}
