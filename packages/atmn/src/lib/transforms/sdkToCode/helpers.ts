/**
 * Helper functions for SDK → Code generation
 */

/**
 * Convert ID to valid variable name
 * Examples: "pro-plan" → "pro_plan", "api_calls" → "api_calls", "123" → "123"
 */
function sanitizeId(id: string): string {
	return id
		.replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid chars with underscore
		.replace(/_+/g, "_") // Collapse multiple underscores
		.replace(/^_/, "") // Remove leading underscore
		.replace(/_$/, ""); // Remove trailing underscore
}

/**
 * Convert ID to valid variable name with context-specific prefix
 * Generic version - kept for backwards compatibility
 */
export function idToVarName(id: string, prefix = "item_"): string {
	const sanitized = sanitizeId(id);

	// JavaScript identifiers can't start with a number
	if (/^[0-9]/.test(sanitized)) {
		return prefix + sanitized;
	}

	return sanitized;
}

/**
 * Convert plan ID to valid variable name
 * Examples: "pro-plan" → "pro_plan", "123" → "plan_123"
 */
export function planIdToVarName(id: string): string {
	return idToVarName(id, "plan_");
}

/**
 * Convert feature ID to valid variable name
 * Examples: "api-calls" → "api_calls", "123" → "feature_123"
 */
export function featureIdToVarName(id: string): string {
	return idToVarName(id, "feature_");
}

/**
 * Resolve variable names for all features and plans, disambiguating any collisions.
 *
 * When a plan and feature share the same sanitized ID (e.g. both have id "free"),
 * the plan's variable name gets a "_plan" suffix to avoid "Cannot redeclare
 * block-scoped variable" errors.
 *
 * Features are declared first in the file so they keep the clean name.
 */
export function resolveVarNames(
	featureIds: string[],
	planIds: string[],
): {
	featureVarMap: Map<string, string>;
	planVarMap: Map<string, string>;
} {
	const featureVarMap = new Map<string, string>();
	const planVarMap = new Map<string, string>();

	for (const id of featureIds) {
		featureVarMap.set(id, featureIdToVarName(id));
	}

	const usedNames = new Set(featureVarMap.values());

	for (const id of planIds) {
		let varName = planIdToVarName(id);
		if (usedNames.has(varName)) {
			varName = `${varName}_plan`;
		}
		planVarMap.set(id, varName);
		usedNames.add(varName);
	}

	return { featureVarMap, planVarMap };
}

/**
 * Escape string for TypeScript string literal
 */
export function escapeString(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

/**
 * Indent code by given number of tabs
 */
export function indentCode(code: string, tabs: number): string {
	const indent = "\t".repeat(tabs);
	return code
		.split("\n")
		.map((line) => (line.trim() ? indent + line : line))
		.join("\n");
}

/**
 * Format a value for TypeScript code
 */
export function formatValue(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return `'${escapeString(value)}'`;
	}
	if (typeof value === "number") {
		return String(value);
	}
	if (typeof value === "boolean") {
		return String(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(formatValue).join(", ")}]`;
	}
	if (typeof value === "object") {
		const entries = Object.entries(value)
			.map(([k, v]) => `${k}: ${formatValue(v)}`)
			.join(", ");
		return `{ ${entries} }`;
	}
	return String(value);
}
