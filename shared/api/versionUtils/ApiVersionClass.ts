import { API_VERSIONS, type ApiVersion } from "./ApiVersion.js";
import type { VersionMetadata } from "./versionRegistry.js";
import {
	getVersionMetadata,
	getVersionsSorted,
} from "./versionRegistryUtils.js";

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

	get value(): ApiVersion {
		return this.version;
	}

	get meta(): VersionMetadata {
		return this.metadata;
	}

	get calver(): string {
		return this.metadata.calver;
	}

	get semver(): ApiVersion {
		return this.version;
	}

	private getIndex(version: ApiVersion): number {
		return this.sortedVersions.indexOf(version);
	}

	gt(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) > this.getIndex(otherVersion);
	}

	gte(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) >= this.getIndex(otherVersion);
	}

	lt(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) < this.getIndex(otherVersion);
	}

	lte(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.getIndex(this.version) <= this.getIndex(otherVersion);
	}

	eq(other: ApiVersion | ApiVersionClass): boolean {
		const otherVersion = other instanceof ApiVersionClass ? other.value : other;
		return this.version === otherVersion;
	}

	neq(other: ApiVersion | ApiVersionClass): boolean {
		return !this.eq(other);
	}

	isDeprecated(): boolean {
		return this.metadata.deprecated === true;
	}

	getMigrationVersion(): ApiVersion | null {
		return this.metadata.migrateToVersion || null;
	}

	toString(): string {
		return this.version;
	}

	toJSON(): string {
		return this.version;
	}
}
