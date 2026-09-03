/**
 * Copied verbatim into the CLI by the generator, so this file imports nothing:
 * a pulled server row becomes fixture source here, in the exact shape the
 * surgery module splices into the user's config.
 */

export type CollectionSpec = {
	readonly builder: string;
	readonly idField: string;
	readonly responseIdField: string;
	readonly keys: readonly string[];
	/** Config key holding past versions, when the collection has history. */
	readonly historyKey?: string;
	/** Whether pull can address entries by idField alone. */
	readonly pull: boolean;
};

const PLAIN_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const keyText = (key: string): string =>
	PLAIN_IDENTIFIER.test(key) ? key : JSON.stringify(key);

const serialize = ({
	value,
	indent,
}: {
	value: unknown;
	indent: string;
}): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value === null || value === undefined) return "null";

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map(
			(entry) =>
				`${indent}\t${serialize({ value: entry, indent: `${indent}\t` })},`,
		);
		return `[\n${items.join("\n")}\n${indent}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>).filter(
		([, entry]) => entry !== undefined,
	);
	if (entries.length === 0) return "{}";
	const items = entries.map(
		([key, entry]) =>
			`${indent}\t${keyText(key)}: ${serialize({ value: entry, indent: `${indent}\t` })},`,
	);
	return `{\n${items.join("\n")}\n${indent}}`;
};

/** A half-nulled display would fail the config lint, so it must not be written. */
const displayOf = (value: unknown): unknown => {
	if (value === null || typeof value !== "object") return undefined;
	const display = value as Record<string, unknown>;
	return typeof display.singular === "string" &&
		typeof display.plural === "string"
		? display
		: undefined;
};

const creditSchemaOf = (value: unknown): unknown => {
	if (!Array.isArray(value)) return value;
	return value.filter((entry) => {
		if (entry === null || typeof entry !== "object") return true;
		return (entry as Record<string, unknown>).meteredFeatureId !== "";
	});
};

const rowValueOf = ({
	spec,
	key,
	row,
	includeMappings,
}: {
	spec: CollectionSpec;
	key: string;
	row: Record<string, unknown>;
	includeMappings: boolean;
}): unknown => {
	if (key === spec.idField) return row[spec.responseIdField];
	// Pulled rows are never archived, so `archived` is not a pull's business.
	if (key === "archived") return undefined;
	if (key === "processors" && !includeMappings) return undefined;
	const value = row[key];
	if (key === "display") return displayOf(value);
	if (key === "creditSchema") return creditSchemaOf(value);
	return value;
};

export const emitFixture = ({
	spec,
	row,
	includeMappings,
	indent,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
	includeMappings: boolean;
	indent: string;
}): string => {
	const lines: string[] = [`${spec.builder}({`];
	for (const key of spec.keys) {
		const value = rowValueOf({ spec, key, row, includeMappings });
		if (value === undefined) continue;
		lines.push(
			`${indent}\t${keyText(key)}: ${serialize({ value, indent: `${indent}\t` })},`,
		);
	}
	lines.push(`${indent}})`);
	return lines.join("\n");
};
