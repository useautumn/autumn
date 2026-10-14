export type { ApiVersionString } from "./ApiVersion.js";
export { API_VERSIONS, ApiVersion, LATEST_VERSION } from "./ApiVersion.js";
export { ApiVersionClass } from "./ApiVersionClass.js";
export {
	calVerToSemVer,
	createdAtToVersion,
	legacyToSemVer,
	parseVersion,
	semVerToCalVer,
	semVerToLegacy,
} from "./convertVersionUtils.js";

export {
	applyRequestVersionChanges,
	applyRequestVersionChangesToArray,
	applyResponseVersionChanges,
	applyResponseVersionChanges as applyVersionChanges,
	applyResponseVersionChangesToArray,
	applyResponseVersionChangesToArray as applyVersionChangesToArray,
	backwardsChangeActive,
	getChangesForResource,
} from "./versionChangeUtils/applyVersionChanges.js";

export {
	AffectedResource,
	VersionChange,
	type VersionChangeConstructor,
} from "./versionChangeUtils/VersionChange.js";
export { VersionChangeRegistryClass } from "./versionChangeUtils/VersionChangeRegistryClass.js";
export type { VersionMetadata } from "./versionRegistry.js";
export { VERSION_REGISTRY } from "./versionRegistry.js";
export {
	CALVER_TO_SEMVER_MAP,
	getVersionMetadata,
	getVersionsBetween,
	getVersionsSorted,
	isValidVersion,
} from "./versionRegistryUtils.js";

import "./versionChangeUtils/versionChangeRegistry.js";

export * from "./versionChangeUtils/versionChangeRegistry.js";
