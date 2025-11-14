import type { ApiVersion } from "../ApiVersion.js";
import type {
	VersionChange,
	VersionChangeConstructor,
} from "./VersionChange.js";

/**
 * Registry for version changes
 * Maps versions → change classes
 */
const changes = new Map<ApiVersion, VersionChangeConstructor[]>();

export const VersionChangeRegistryClass: {
	register(args: {
		version: ApiVersion;
		changes: VersionChangeConstructor[];
	}): void;
	getChangesForVersion(args: { version: ApiVersion }): VersionChange[];
	getRegisteredVersions(): ApiVersion[];
	isChangeActive(args: {
		targetVersion: ApiVersion;
		changeClass: VersionChangeConstructor;
	}): boolean;
	clear(): void;
} = {
	register({
		version,
		changes: versionChanges,
	}: {
		version: ApiVersion;
		changes: VersionChangeConstructor[];
	}) {
		changes.set(version, versionChanges);
	},

	getChangesForVersion({ version }: { version: ApiVersion }): VersionChange[] {
		const changeClasses = changes.get(version) || [];
		// Simply instantiate each change class - no caching needed since they're stateless
		return changeClasses.map((ChangeClass) => new ChangeClass());
	},

	getRegisteredVersions(): ApiVersion[] {
		return Array.from(changes.keys());
	},

	isChangeActive({
		targetVersion,
		changeClass,
	}: {
		targetVersion: ApiVersion;
		changeClass: VersionChangeConstructor;
	}): boolean {
		const change = new changeClass();
		return versionLt({ v1: targetVersion, v2: change.newVersion });
	},

	clear() {
		changes.clear();
	},
};

function versionLt({ v1, v2 }: { v1: ApiVersion; v2: ApiVersion }): boolean {
	const versions = Array.from(changes.keys()).sort();
	return versions.indexOf(v1) < versions.indexOf(v2);
}
