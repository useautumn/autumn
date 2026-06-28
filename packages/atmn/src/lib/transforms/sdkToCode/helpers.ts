/**
 * Helper functions for SDK → Code generation
 */

/**
 * Convert ID to camelCase tokens for JavaScript variable names.
 * Examples: "pro-plan" → ["pro", "plan"], "api_calls" → ["api", "calls"]
 */
function idToTokens(id: string): string[] {
	return id
		.split(/[^a-zA-Z0-9]+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

const lowerFirst = (value: string): string =>
	value.charAt(0).toLowerCase() + value.slice(1);

const upperFirst = (value: string): string =>
	value.charAt(0).toUpperCase() + value.slice(1);

function toCamelCase(id: string): string {
	const tokens = idToTokens(id).map((token) => token.toLowerCase());
	if (tokens.length === 0) return "";
	return [
		tokens[0]!,
		...tokens.slice(1).map((token) => upperFirst(token)),
	].join("");
}

/**
 * Convert ID to valid variable name with context-specific prefix
 * Generic version - kept for backwards compatibility
 */
export function idToVarName(id: string, prefix = "item_"): string {
	const sanitized = toCamelCase(id);
	const normalizedPrefix = prefix.replace(/_+$/, "");

	// JavaScript identifiers can't start with a number
	if (!sanitized || /^[0-9]/.test(sanitized)) {
		return `${normalizedPrefix}${upperFirst(sanitized)}`;
	}

	return sanitized;
}

/**
 * Convert plan ID to valid variable name
 * Examples: "pro-plan" → "proPlan", "123" → "plan123"
 */
export function planIdToVarName(id: string): string {
	return idToVarName(id, "plan");
}

/**
 * Convert feature ID to valid variable name
 * Examples: "api-calls" → "apiCalls", "123" → "feature123"
 */
export function featureIdToVarName(id: string): string {
	return idToVarName(id, "feature");
}

export function variantIdToVarName(id: string): string {
	return idToVarName(id, "plan");
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
	variantIds: string[] = [],
): {
	featureVarMap: Map<string, string>;
	planVarMap: Map<string, string>;
	variantVarMap: Map<string, string>;
} {
	const featureVarMap = new Map<string, string>();
	const planVarMap = new Map<string, string>();
	const variantVarMap = new Map<string, string>();

	for (const id of featureIds) {
		featureVarMap.set(id, featureIdToVarName(id));
	}

	const usedNames = new Set(featureVarMap.values());

	for (const id of planIds) {
		let varName = planIdToVarName(id);
		if (usedNames.has(varName)) {
			varName = `${varName}Plan`;
		}
		planVarMap.set(id, varName);
		usedNames.add(varName);
	}

	for (const id of variantIds) {
		let varName = variantIdToVarName(id);
		if (usedNames.has(varName)) {
			varName = `${varName}Variant`;
		}
		variantVarMap.set(id, varName);
		usedNames.add(varName);
	}

	return { featureVarMap, planVarMap, variantVarMap };
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

const formatObjectKey = (key: string): string =>
	/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${escapeString(key)}'`;

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
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${formatObjectKey(k)}: ${formatValue(v)}`)
			.join(", ");
		return `{ ${entries} }`;
	}
	return String(value);
}
