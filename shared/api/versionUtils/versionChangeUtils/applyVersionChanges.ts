import type { SharedContext } from "../../../types/sharedContext.js";
import { type ApiVersion, LATEST_VERSION } from "../ApiVersion.js";
import { ApiVersionClass } from "../ApiVersionClass.js";
import {
	getVersionsBetween,
	getVersionsForRequestTransform,
} from "../versionRegistryUtils.js";
import type {
	AffectedResource,
	VersionChange,
	VersionChangeConstructor,
} from "./VersionChange.js";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass.js";

// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyResponseVersionChanges<T = any, TLegacyData = any>({
	input,
	legacyData,
	currentVersion,
	targetVersion,
	resource,
	ctx,
}: {
	input: T;
	legacyData?: TLegacyData;
	currentVersion?: ApiVersionClass;
	targetVersion: ApiVersionClass;
	resource: AffectedResource;
	ctx: SharedContext;
}): T {
	const _currentVersion = currentVersion || new ApiVersionClass(LATEST_VERSION);

	if (_currentVersion.eq(targetVersion)) {
		return input;
	}

	if (targetVersion.gt(_currentVersion)) {
		targetVersion = _currentVersion;
	}

	const versionsToApply = getVersionsBetween({
		from: targetVersion.value,
		to: _currentVersion.value,
	}).filter((v) => v !== targetVersion.value);
	versionsToApply.reverse();

	const printLogs = false;

	let transformedData = input;

	for (const version of versionsToApply) {
		const changes = VersionChangeRegistryClass.getChangesForVersion({
			version,
		});
		if (printLogs) {
			console.log(`Changes for version ${version}`);
		}

		for (const change of changes) {
			if (!change.affects(resource)) {
				continue;
			}

			if (!change.affectsResponse) {
				continue;
			}

			if (change.hasSideEffects) {
				continue;
			}

			const shouldApply = targetVersion.lte(change.oldVersion);
			if (!shouldApply) continue;

			if (printLogs) {
				console.log(`Applying change ${change.name} for version ${version}`);
			}

			transformedData = change.transformResponse({
				input: transformedData,
				legacyData: legacyData,
				ctx: ctx,
			}) as T;
		}
	}

	return transformedData;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyRequestVersionChanges<T = any, TLegacyData = any>({
	input,
	legacyData,
	fromVersion,
	toVersion,
	resource,
	ctx,
}: {
	input: T;
	legacyData?: TLegacyData;
	fromVersion: ApiVersionClass;
	toVersion: ApiVersionClass;
	resource: AffectedResource;
	ctx: SharedContext;
}): T {
	if (fromVersion.eq(toVersion)) {
		return input;
	}

	if (fromVersion.gt(toVersion)) {
		throw new Error(
			`Cannot transform forward from ${fromVersion} to ${toVersion}. ` +
				"Current version should be >= target version.",
		);
	}

	const versionsToApply = getVersionsForRequestTransform({
		from: fromVersion.value,
		to: toVersion.value,
	});

	let transformedData = input;
	for (const version of versionsToApply) {
		const changes = VersionChangeRegistryClass.getChangesForVersion({
			version,
		});

		for (const change of changes) {
			if (!change.affects(resource)) {
				continue;
			}

			if (!change.affectsRequest) {
				continue;
			}

			if (change.hasSideEffects) {
				continue;
			}

			transformedData = change.transformRequest({
				input: transformedData,
				// biome-ignore lint/suspicious/noExplicitAny: Runtime type flexibility needed for version changes
				legacyData: legacyData as any,
				ctx,
			}) as T;
		}
	}

	return transformedData;
}

export function backwardsChangeActive({
	apiVersion,
	versionChange,
}: {
	apiVersion: ApiVersionClass;
	versionChange: VersionChangeConstructor;
}): boolean {
	const change = new versionChange();
	return apiVersion.lte(change.oldVersion);
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyResponseVersionChangesToArray<T = any, TLegacyData = any>({
	inputArray,
	legacyData,
	currentVersion,
	targetVersion,
	resource,
	ctx,
}: {
	inputArray: T[];
	legacyData?: TLegacyData;
	currentVersion?: ApiVersionClass;
	targetVersion: ApiVersionClass;
	resource: AffectedResource;
	ctx: SharedContext;
}): T[] {
	return inputArray.map((item) =>
		applyResponseVersionChanges({
			input: item,
			legacyData,
			currentVersion,
			targetVersion,
			resource,
			ctx,
		}),
	);
}

// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyRequestVersionChangesToArray<T = any, TLegacyData = any>({
	inputArray,
	legacyData,
	fromVersion,
	toVersion,
	resource,
	ctx,
}: {
	inputArray: T[];
	legacyData?: TLegacyData;
	fromVersion: ApiVersionClass;
	toVersion: ApiVersionClass;
	resource: AffectedResource;
	ctx: SharedContext;
}): T[] {
	return inputArray.map((item) =>
		applyRequestVersionChanges({
			input: item,
			legacyData,
			fromVersion,
			toVersion,
			resource,
			ctx,
		}),
	);
}

export function getChangesForResource({
	currentVersion,
	targetVersion,
	resource,
}: {
	currentVersion: ApiVersion;
	targetVersion: ApiVersion;
	resource: AffectedResource;
}): VersionChange[] {
	const versionsToApply = getVersionsBetween({
		from: targetVersion,
		to: currentVersion,
	}).filter((v) => v !== targetVersion);

	versionsToApply.reverse();

	const allChanges = [];
	for (const version of versionsToApply) {
		const changes = VersionChangeRegistryClass.getChangesForVersion({
			version,
		});
		for (const change of changes) {
			if (change.affects(resource)) {
				allChanges.push(change);
			}
		}
	}

	return allChanges;
}
