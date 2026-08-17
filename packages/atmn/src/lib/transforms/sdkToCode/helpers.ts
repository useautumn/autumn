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
		.map(part => part.trim())
		.filter(Boolean);
}

const upperFirst = (value: string): string =>
	value.charAt(0).toUpperCase() + value.slice(1);

function toCamelCase(id: string): string {
	const tokens = idToTokens(id).map(token => token.toLowerCase());
	if (tokens.length === 0) return '';
	return [tokens[0]!, ...tokens.slice(1).map(token => upperFirst(token))].join(
		'',
	);
}

/**
 * Convert ID to valid variable name with context-specific prefix
 * Generic version - kept for backwards compatibility
 */
export function idToVarName(id: string, prefix = 'item_'): string {
	const sanitized = toCamelCase(id);
	const normalizedPrefix = prefix.replace(/_+$/, '');

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
	return idToVarName(id, 'plan');
}

/**
 * Convert feature ID to valid variable name
 * Examples: "api-calls" → "apiCalls", "123" → "feature123"
 */
export function featureIdToVarName(id: string): string {
	return idToVarName(id, 'feature');
}

export function variantIdToVarName(id: string): string {
	return idToVarName(id, 'plan');
}

export const versionedCodegenId = ({
	id,
	version,
}: {
	id: string;
	version?: number;
}) => (version === undefined ? id : `${id}-v-${version}`);

export function claimVarName({
	candidate,
	suffix,
	usedNames,
}: {
	candidate: string;
	suffix: string;
	usedNames: Set<string>;
}): string {
	let varName = candidate;
	let index = 1;
	while (usedNames.has(varName)) {
		varName = `${candidate}${suffix}${index === 1 ? '' : index}`;
		index++;
	}
	usedNames.add(varName);
	return varName;
}

const allocateVarNames = ({
	ids,
	candidate,
	suffix,
	usedNames,
}: {
	ids: string[];
	candidate: (id: string) => string;
	suffix: string;
	usedNames: Set<string>;
}) =>
	new Map(
		ids.map(id => [
			id,
			claimVarName({candidate: candidate(id), suffix, usedNames}),
		]),
	);

/** Allocates unique variable names in declaration order. */
export function resolveVarNames(
	featureIds: string[],
	planIds: string[],
	variantIds: string[] = [],
	{
		rewardIds = [],
		referralProgramIds = [],
	}: {
		rewardIds?: string[];
		referralProgramIds?: string[];
	} = {},
): {
	featureVarMap: Map<string, string>;
	planVarMap: Map<string, string>;
	variantVarMap: Map<string, string>;
	rewardVarMap: Map<string, string>;
	referralProgramVarMap: Map<string, string>;
} {
	const usedNames = new Set<string>();
	const featureVarMap = allocateVarNames({
		ids: featureIds,
		candidate: featureIdToVarName,
		suffix: 'Feature',
		usedNames,
	});
	const planVarMap = allocateVarNames({
		ids: planIds,
		candidate: planIdToVarName,
		suffix: 'Plan',
		usedNames,
	});
	const variantVarMap = allocateVarNames({
		ids: variantIds,
		candidate: variantIdToVarName,
		suffix: 'Variant',
		usedNames,
	});
	const rewardVarMap = allocateVarNames({
		ids: rewardIds,
		candidate: id => idToVarName(`reward-${id}`),
		suffix: 'Reward',
		usedNames,
	});
	const referralProgramVarMap = allocateVarNames({
		ids: referralProgramIds,
		candidate: id => idToVarName(`referral-program-${id}`),
		suffix: 'ReferralProgram',
		usedNames,
	});

	return {
		featureVarMap,
		planVarMap,
		variantVarMap,
		rewardVarMap,
		referralProgramVarMap,
	};
}

/**
 * Escape string for TypeScript string literal
 */
export function escapeString(str: string): string {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r')
		.replace(/\t/g, '\\t');
}

/**
 * Indent code by given number of tabs
 */
export function indentCode(code: string, tabs: number): string {
	const indent = '\t'.repeat(tabs);
	return code
		.split('\n')
		.map(line => (line.trim() ? indent + line : line))
		.join('\n');
}

const formatObjectKey = (key: string): string =>
	/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `'${escapeString(key)}'`;

/**
 * Format a value for TypeScript code
 */
export function formatValue(value: unknown): string {
	if (value === null) {
		return 'null';
	}
	if (value === undefined) {
		return 'undefined';
	}
	if (typeof value === 'string') {
		return `'${escapeString(value)}'`;
	}
	if (typeof value === 'number') {
		return String(value);
	}
	if (typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(formatValue).join(', ')}]`;
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value)
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${formatObjectKey(k)}: ${formatValue(v)}`)
			.join(', ');
		return `{ ${entries} }`;
	}
	return String(value);
}

const formatMultilineValue = ({
	value,
	depth,
}: {
	value: unknown;
	depth: number;
}): string => {
	if (!Array.isArray(value) && (value === null || typeof value !== 'object'))
		return formatValue(value);

	const entries = Array.isArray(value)
		? value.map(item => [null, item] as const)
		: Object.entries(value).filter(([, item]) => item !== undefined);
	if (!entries.length) return Array.isArray(value) ? '[]' : '{}';

	const indent = '\t'.repeat(depth);
	const childIndent = `${indent}\t`;
	const lines = entries.map(([key, item]) => {
		const prefix = key === null ? '' : `${formatObjectKey(key)}: `;
		return `${childIndent}${prefix}${formatMultilineValue({value: item, depth: depth + 1})},`;
	});
	return `${Array.isArray(value) ? '[' : '{'}\n${lines.join('\n')}\n${indent}${Array.isArray(value) ? ']' : '}'}`;
};

export const formatValueMultiline = (value: unknown): string =>
	formatMultilineValue({value, depth: 0});
