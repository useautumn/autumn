import type { ApiVersion } from "../ApiVersion.js";
import type { VersionChange, VersionChangeConstructor } from "./VersionChange.js";

/**
 * Registry for version changes
 * Maps versions → change classes
 */
export class VersionChangeRegistryClass {
	private static changes: Map<ApiVersion, VersionChangeConstructor[]> = new Map();
	private static instances: Map<string, VersionChange> = new Map();

	static register({
		version,
		changes,
	}: {
		version: ApiVersion;
		changes: VersionChangeConstructor[];
	}) {
		this.changes.set(version, changes);
	}

	static getChangesForVersion({ version }: { version: ApiVersion }): VersionChange[] {
		const changeClasses = this.changes.get(version) || [];
		return changeClasses.map((ChangeClass) => {
			const key = `${version}-${ChangeClass.name}`;
			if (!this.instances.has(key)) {
				this.instances.set(key, new ChangeClass());
			}
			const instance = this.instances.get(key);
			if (!instance) {
				throw new Error(`Failed to create instance for ${ChangeClass.name}`);
			}
			return instance;
		});
	}

	static getRegisteredVersions(): ApiVersion[] {
		return Array.from(this.changes.keys());
	}

	static isChangeActive({
		targetVersion,
		currentVersion,
		changeClass,
	}: {
		targetVersion: ApiVersion;
		currentVersion: ApiVersion;
		changeClass: VersionChangeConstructor;
	}): boolean {
		const change = new changeClass();
		return this.versionLt({ v1: targetVersion, v2: change.version });
	}

	private static versionLt({ v1, v2 }: { v1: ApiVersion; v2: ApiVersion }): boolean {
		const versions = Array.from(this.changes.keys()).sort();
		return versions.indexOf(v1) < versions.indexOf(v2);
	}

	static clear() {
		this.changes.clear();
		this.instances.clear();
	}
}
