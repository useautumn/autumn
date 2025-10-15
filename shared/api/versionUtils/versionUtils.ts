/**
 * Main exports for the unified API versioning system
 */

// Version types and core
export type { ApiVersionString } from "./ApiVersion.js";
export { API_VERSIONS, ApiVersion, LATEST_VERSION } from "./ApiVersion.js";
export { ApiVersionClass } from "./ApiVersionClass.js";
// Conversion utilities
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
	// Deprecated aliases (for backward compatibility)
	applyResponseVersionChanges as applyVersionChanges,
	applyResponseVersionChangesToArray,
	applyResponseVersionChangesToArray as applyVersionChangesToArray,
	backwardsChangeActive,
	getChangesForResource,
} from "./versionChangeUtils/applyVersionChanges.js";

// Version changes
export {
	AffectedResource,
	VersionChange,
	type VersionChangeConstructor,
} from "./versionChangeUtils/VersionChange.js";
export { VersionChangeRegistryClass } from "./versionChangeUtils/VersionChangeRegistryClass.js";
// Version registry
export type { VersionMetadata } from "./versionRegistry.js";
export { VERSION_REGISTRY } from "./versionRegistry.js";
// Version registry utilities
export {
	CALVER_TO_SEMVER_MAP,
	getVersionMetadata,
	getVersionsBetween,
	getVersionsSorted,
	isValidVersion,
} from "./versionRegistryUtils.js";

// Auto-register all version changes
import "./versionChangeUtils/versionChangeRegistry.js";

export * from "./versionChangeUtils/versionChangeRegistry.js";
