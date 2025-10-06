/**
 * Standardized utilities for version-based branching logic
 *
 * These utilities provide clean, readable ways to handle version-dependent
 * logic (side effects) that can't be encapsulated in response transforms.
 *
 * Use these instead of raw if/else checks for better maintainability.
 */

import type { ApiVersion } from "./ApiVersion.js";
import type { ApiVersionClass } from "./ApiVersionClass.js";

/**
 * Execute callback if version meets condition
 *
 * @example
 * ifVersion(apiVersion, {
 *   gte: ApiVersion.V1_1,
 *   callback: () => {
 *     expandArray.push(CusExpand.Invoices);
 *   }
 * });
 */
export function ifVersion({
	version,
	condition,
	callback,
}: {
	version: ApiVersionClass;
	condition:
		| { gt: ApiVersion }
		| { gte: ApiVersion }
		| { lt: ApiVersion }
		| { lte: ApiVersion }
		| { eq: ApiVersion };
	callback: () => void;
}): void {
	let shouldExecute = false;

	if ("gt" in condition) {
		shouldExecute = version.gt(condition.gt);
	} else if ("gte" in condition) {
		shouldExecute = version.gte(condition.gte);
	} else if ("lt" in condition) {
		shouldExecute = version.lt(condition.lt);
	} else if ("lte" in condition) {
		shouldExecute = version.lte(condition.lte);
	} else if ("eq" in condition) {
		shouldExecute = version.eq(condition.eq);
	}

	if (shouldExecute) {
		callback();
	}
}

/**
 * Return value based on version
 *
 * @example
 * const schema = versionSwitch(apiVersion, {
 *   [ApiVersion.V1_2]: SchemaV1_2,
 *   [ApiVersion.V1_1]: SchemaV1_1,
 *   default: SchemaV1
 * });
 */
export function versionSwitch<T>({
	version,
	cases,
}: {
	version: ApiVersionClass;
	cases: Partial<Record<ApiVersion, T>> & { default: T };
}): T {
	// Try exact match first
	const exactMatch = cases[version.value];
	if (exactMatch !== undefined) {
		return exactMatch;
	}

	// Walk down from current version to find closest match
	const sortedCases = Object.keys(cases)
		.filter((k) => k !== "default")
		.sort()
		.reverse() as ApiVersion[];

	for (const caseVersion of sortedCases) {
		if (version.gte(caseVersion)) {
			return cases[caseVersion]!;
		}
	}

	return cases.default;
}

/**
 * Get value from map based on version range
 *
 * @example
 * const withItems = versionRange(apiVersion, {
 *   gte: ApiVersion.V0_2,
 *   value: true,
 *   default: false
 * });
 */
export function versionRange<T>({
	version,
	range,
}: {
	version: ApiVersionClass;
	range:
		| { gte: ApiVersion; value: T; default: T }
		| { gt: ApiVersion; value: T; default: T }
		| { lte: ApiVersion; value: T; default: T }
		| { lt: ApiVersion; value: T; default: T };
}): T {
	if ("gte" in range && version.gte(range.gte)) {
		return range.value;
	}
	if ("gt" in range && version.gt(range.gt)) {
		return range.value;
	}
	if ("lte" in range && version.lte(range.lte)) {
		return range.value;
	}
	if ("lt" in range && version.lt(range.lt)) {
		return range.value;
	}
	return range.default;
}

/**
 * Guard clause - require minimum version
 *
 * @example
 * requireVersion(apiVersion, {
 *   min: ApiVersion.V1_1,
 *   error: "This endpoint requires API version 2025-04-17 or later"
 * });
 */
export function requireVersion({
	version,
	min,
	error,
}: {
	version: ApiVersionClass;
	min: ApiVersion;
	error?: string;
}): void {
	if (version.lt(min)) {
		throw new Error(
			error ||
				`This feature requires API version ${min} or later (current: ${version.value})`,
		);
	}
}

/**
 * Execute one of two callbacks based on version comparison
 *
 * @example
 * const result = versionTernary({
 *   version: apiVersion,
 *   condition: { gte: ApiVersion.V1_1 },
 *   ifTrue: () => getNewFormat(),
 *   ifFalse: () => getLegacyFormat()
 * });
 */
export function versionTernary<T>({
	version,
	condition,
	ifTrue,
	ifFalse,
}: {
	version: ApiVersionClass;
	condition:
		| { gt: ApiVersion }
		| { gte: ApiVersion }
		| { lt: ApiVersion }
		| { lte: ApiVersion }
		| { eq: ApiVersion };
	ifTrue: () => T;
	ifFalse: () => T;
}): T {
	let shouldExecuteTrue = false;

	if ("gt" in condition) {
		shouldExecuteTrue = version.gt(condition.gt);
	} else if ("gte" in condition) {
		shouldExecuteTrue = version.gte(condition.gte);
	} else if ("lt" in condition) {
		shouldExecuteTrue = version.lt(condition.lt);
	} else if ("lte" in condition) {
		shouldExecuteTrue = version.lte(condition.lte);
	} else if ("eq" in condition) {
		shouldExecuteTrue = version.eq(condition.eq);
	}

	return shouldExecuteTrue ? ifTrue() : ifFalse();
}
