import { type ApiVersion, LATEST_VERSION } from "../ApiVersion.js";
import { ApiVersionClass } from "../ApiVersionClass.js";
import { getVersionsBetween } from "../versionRegistryUtils.js";
import type { AffectedResource } from "./VersionChange.js";
import { VersionChangeRegistryClass } from "./VersionChangeRegistryClass.js";

/**
 * Apply response transformations (backward: new → old)
 *
 * Walks backwards from currentVersion to targetVersion,
 * applying each version change's transformResponse() function.
 *
 * @param input - Data in the newest version format
 * @param legacyData - Legacy fields data for reconstructing deprecated fields (optional)
 * @param currentVersion - Version of the input data (defaults to LATEST_VERSION)
 * @param targetVersion - Version to transform to (older)
 * @param resource - Resource being transformed
 *
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyResponseVersionChanges<T = any, TLegacyData = any>({
	input,
	legacyData,
	currentVersion,
	targetVersion,
	resource,
}: {
	input: T;
	legacyData?: TLegacyData;
	currentVersion?: ApiVersionClass;
	targetVersion: ApiVersionClass;
	resource: AffectedResource;
}): T {
	// Default currentVersion to latest if not provided
	const _currentVersion = currentVersion || new ApiVersionClass(LATEST_VERSION);
	// If versions are equal, no transformation needed
	if (_currentVersion.eq(targetVersion)) {
		return input;
	}

	// If target is newer than current, throw error (can't transform forward)
	if (targetVersion.gt(_currentVersion)) {
		targetVersion = _currentVersion;
		// throw new Error(
		// 	`Cannot transform forward from ${_currentVersion} to ${targetVersion}. ` +
		// 		"Transforms only work backwards to older versions.",
		// );
	}

	// Get all versions between current and target (exclusive of target, inclusive of current)
	const versionsToApply = getVersionsBetween({
		from: targetVersion.value,
		to: _currentVersion.value,
	}).filter((v) => v !== targetVersion.value); // Exclude target itself

	// Sort versions from newest to oldest (we apply backwards)
	versionsToApply.reverse();

	// Apply each version's changes
	let transformedData = input;
	for (const version of versionsToApply) {
		const changes = VersionChangeRegistryClass.getChangesForVersion({
			version,
		});

		for (const change of changes) {
			// Skip if this change doesn't affect our resource
			if (!change.affects(resource)) {
				continue;
			}

			// Skip if doesn't affect responses
			if (!change.affectsResponse) {
				continue;
			}

			// Skip if this change has side effects (must be handled elsewhere)
			if (change.hasSideEffects) {
				continue;
			}

			// Apply if targetVersion <= oldVersion
			// Example: If change.oldVersion = V0_2 and targetVersion = V0_2, then apply
			const shouldApply = targetVersion.lte(change.oldVersion);
			if (!shouldApply) continue;

			const description = Array.isArray(change.description)
				? change.description.join("; ")
				: change.description;

			// console.log(`Applying change [${change.oldVersion}]: ${description}`);
			// Apply the response transformation (backward)
			transformedData = change.transformResponse({
				input: transformedData,
				legacyData: legacyData,
			}) as T;
		}
	}

	return transformedData;
}

/**
 * Apply request transformations (forward: old → new)
 *
 * Walks FORWARD from targetVersion to currentVersion,
 * applying each version change's transformRequest() function.
 *
 * This is used to transform old request formats to the latest version.
 *
 * @param input - Data in the older version format
 * @param legacyData - Legacy fields data for reconstructing deprecated fields (optional)
 * @param targetVersion - User's version (older)
 * @param currentVersion - Latest version (newer)
 * @param resource - Resource being transformed
 *
 * @example
 * // Data is in V1_1 format, transform to V1_2
 * const v1_2_data = applyRequestVersionChanges({
 *   input: v1_1_request,
 *   targetVersion: new ApiVersionClass(ApiVersion.V1_1),  // User's version
 *   currentVersion: new ApiVersionClass(ApiVersion.V1_2),  // Latest
 *   resource: AffectedResource.Product
 * });
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyRequestVersionChanges<T = any, TLegacyData = any>({
	input,
	legacyData,
	targetVersion,
	currentVersion,
	resource,
}: {
	input: T;
	legacyData?: TLegacyData;
	targetVersion: ApiVersionClass; // User's version (old)
	currentVersion: ApiVersionClass; // Latest version (new)
	resource: AffectedResource;
}): T {
	// If versions are equal, no transformation needed
	if (targetVersion.eq(currentVersion)) {
		return input;
	}

	// If target is newer than current, throw error
	if (targetVersion.gt(currentVersion)) {
		throw new Error(
			`Cannot transform forward from ${currentVersion} to ${targetVersion}. ` +
				"Current version should be >= target version.",
		);
	}

	// Get all versions between target and current (exclusive of current, inclusive of target)
	const versionsToApply = getVersionsBetween({
		from: targetVersion.value,
		to: currentVersion.value,
	}).filter((v) => v !== currentVersion.value); // Exclude current itself

	// Don't reverse - we want to go forward (old → new)
	// versionsToApply is already in ascending order from getVersionsBetween

	// Apply each version's changes
	let transformedData = input;
	for (const version of versionsToApply) {
		const changes = VersionChangeRegistryClass.getChangesForVersion({
			version,
		});

		for (const change of changes) {
			// Skip if this change doesn't affect our resource
			if (!change.affects(resource)) {
				continue;
			}

			// Skip if doesn't affect requests
			if (!change.affectsRequest) {
				continue;
			}

			// Skip if this change has side effects (must be handled elsewhere)
			if (change.hasSideEffects) {
				continue;
			}

			// Apply the request transformation (forward)
			transformedData = change.transformRequest({
				input: transformedData,
				// biome-ignore lint/suspicious/noExplicitAny: Runtime type flexibility needed for version changes
				legacyData: legacyData as any,
			}) as T;
		}
	}

	return transformedData;
}

/**
 * Check if a specific change is active for the given target version
 *
 * Used for side-effect changes that can't be encapsulated in transforms.
 * A change is "active" if the target version is older than the version
 * where the change was introduced.
 *
 * @example
 * // In your code:
 * if (isChangeActive(targetVersion, LegacyExpandInvoicesChange)) {
 *   // Add expand=invoices to the query
 *   expandArray.push(CusExpand.Invoices);
 * }
 */
export function backwardsChangeActive({
	apiVersion,
	versionChange,
}: {
	apiVersion: ApiVersionClass;
	versionChange: new () => any;
}): boolean {
	const change = new versionChange();
	return apiVersion.lte(change.oldVersion);
}

/**
 * Helper to apply response changes to an array of objects
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyResponseVersionChangesToArray<T = any, TLegacyData = any>({
	inputArray,
	legacyData,
	currentVersion,
	targetVersion,
	resource,
}: {
	inputArray: T[];
	legacyData?: TLegacyData;
	currentVersion?: ApiVersionClass;
	targetVersion: ApiVersionClass;
	resource: AffectedResource;
}): T[] {
	return inputArray.map((item) =>
		applyResponseVersionChanges({
			input: item,
			legacyData,
			currentVersion,
			targetVersion,
			resource,
		}),
	);
}

/**
 * Helper to apply request changes to an array of objects
 */
// biome-ignore lint/suspicious/noExplicitAny: Generic type parameter needs flexibility
export function applyRequestVersionChangesToArray<T = any, TLegacyData = any>({
	inputArray,
	legacyData,
	targetVersion,
	currentVersion,
	resource,
}: {
	inputArray: T[];
	legacyData?: TLegacyData;
	targetVersion: ApiVersionClass;
	currentVersion: ApiVersionClass;
	resource: AffectedResource;
}): T[] {
	return inputArray.map((item) =>
		applyRequestVersionChanges({
			input: item,
			legacyData,
			targetVersion,
			currentVersion,
			resource,
		}),
	);
}

/**
 * Get all version changes that affect a specific resource between two versions
 */
export function getChangesForResource({
	currentVersion,
	targetVersion,
	resource,
}: {
	currentVersion: ApiVersion;
	targetVersion: ApiVersion;
	resource: AffectedResource;
}) {
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
