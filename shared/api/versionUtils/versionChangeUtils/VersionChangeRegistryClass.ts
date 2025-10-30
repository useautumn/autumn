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
const instances = new Map<string, VersionChange>();

export const VersionChangeRegistryClass = {
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
		// const changeClasses = changes.get(version) || [];
		// return changeClasses.map((ChangeClass) => {
		// 	const key = `${version}-${ChangeClass.name}`;
		// 	if (!instances.has(key)) {
		// 		instances.set(key, new ChangeClass());
		// 	}
		// 	const instance = instances.get(key);
		// 	if (!instance) {
		// 		throw new Error(`Failed to create instance for ${ChangeClass.name}`);
		// 	}
		// 	return instance;
		// });
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
		instances.clear();
	},
};

function versionLt({ v1, v2 }: { v1: ApiVersion; v2: ApiVersion }): boolean {
	const versions = Array.from(changes.keys()).sort();
	return versions.indexOf(v1) < versions.indexOf(v2);
}
