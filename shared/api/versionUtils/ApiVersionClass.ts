import { ApiVersion, API_VERSIONS } from "./ApiVersion.js";
import type { VersionMetadata } from "./versionRegistry.js";
import { getVersionMetadata, getVersionsSorted } from "./versionRegistryUtils.js";

/**
 * ApiVersionClass - Encapsulates version comparison logic
 *
 * Provides semantic comparison methods (gt, lt, gte, lte, eq) for API versions.
 * Only accepts valid versions from the ApiVersion enum.
 *
 * @example
 * const v1 = new ApiVersionClass(ApiVersion.V1_1);
 * const v2 = new ApiVersionClass(ApiVersion.V1_2);
 * v2.gt(v1); // true
 * v1.gte(ApiVersion.V1_1); // true
 */
export class ApiVersionClass {
	private readonly version: ApiVersion;
	private readonly metadata: VersionMetadata;
	private readonly sortedVersions: ApiVersion[];

	constructor(version: ApiVersion) {
		if (!API_VERSIONS.includes(version)) {
			throw new Error(`Invalid API version: ${version}`);
		}
		this.version = version;
		this.metadata = getVersionMetadata({ version });
		this.sortedVersions = getVersionsSorted();
	}

	/**
	 * Get the current version
	 */
	get value(): ApiVersion {
		return this.version;
	}

	/**
	 * Get version metadata
	 */
	get meta(): VersionMetadata {
		return this.metadata;
	}

	/**
	 * Get the CalVer representation (for headers)
	 */
	get calver(): string {
		return this.metadata.calver;
	}

	/**
	 * Get the SemVer representation
	 */
	get semver(): ApiVersion {
		return this.version;
	}

	/**
	 * Get the index of this version in the sorted list
	 */
	private getIndex(version: ApiVersion): number {
		return this.sortedVersions.indexOf(version);
	}

	/**
	 * Greater than
	 */
	gt(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) > this.getIndex(otherVersion);
	}

	/**
	 * Greater than or equal
	 */
	gte(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) >= this.getIndex(otherVersion);
	}

	/**
	 * Less than
	 */
	lt(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) < this.getIndex(otherVersion);
	}

	/**
	 * Less than or equal
	 */
	lte(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) <= this.getIndex(otherVersion);
	}

	/**
	 * Equal
	 */
	eq(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.version === otherVersion;
	}

	/**
	 * Not equal
	 */
	neq(other: ApiVersion | ApiVersionClass): boolean {
		return !this.eq(other);
	}

	/**
	 * Check if this version is deprecated
	 */
	isDeprecated(): boolean {
		return this.metadata.deprecated === true;
	}

	/**
	 * Get the version to migrate to (if deprecated)
	 */
	getMigrationVersion(): ApiVersion | null {
		return this.metadata.migrateToVersion || null;
	}

	/**
	 * String representation
	 */
	toString(): string {
		return this.version;
	}

	/**
	 * JSON representation
	 */
	toJSON(): string {
		return this.version;
	}
}
