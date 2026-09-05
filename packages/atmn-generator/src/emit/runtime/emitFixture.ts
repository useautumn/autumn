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
	/** Every fixture path a config may state, collection-relative (no `entitlementId`, `versioning`, …). */
	readonly paths: readonly string[];
	/** Config key holding past versions, when the collection has history. */
	readonly historyKey?: string;
	/** Whether pull can address entries by idField alone. */
	readonly pull: boolean;
	/** Wire-named, item-rooted paths kept for existing catalogs only. */
	readonly deprecated?: readonly { path: string; reason: string }[];
};

const PLAIN_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const keyText = (key: string): string =>
	PLAIN_IDENTIFIER.test(key) ? key : JSON.stringify(key);

/**
 * A path the schema never describes further (`metadata`, a usage-limit
 * filter's `properties` bag) is free-form: nothing declares its shape, so the
 * row's own data IS the fixture's data, copied through untouched.
 */
const serializeVerbatim = ({
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
				`${indent}\t${serializeVerbatim({ value: entry, indent: `${indent}\t` })},`,
		);
		return `[\n${items.join("\n")}\n${indent}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>).filter(
		([, entry]) => entry !== undefined,
	);
	if (entries.length === 0) return "{}";
	const items = entries.map(
		([key, entry]) =>
			`${indent}\t${keyText(key)}: ${serializeVerbatim({ value: entry, indent: `${indent}\t` })},`,
	);
	return `{\n${items.join("\n")}\n${indent}}`;
};

type PathIndex = {
	paths: ReadonlySet<string>;
	/** Container paths whose values are a record: every key is the user's data, not the schema's. */
	records: ReadonlySet<string>;
	/** Container paths the schema declares at least one child under. */
	parents: ReadonlySet<string>;
};

const pathIndexOf = (specPaths: readonly string[]): PathIndex => {
	const paths = new Set(specPaths);
	const records = new Set<string>();
	const parents = new Set<string>();
	for (const path of specPaths) {
		const segments = path.split(".");
		for (let depth = 1; depth < segments.length; depth++) {
			parents.add(segments.slice(0, depth).join("."));
		}
		const wildcard = segments.indexOf("*");
		if (wildcard > 0) records.add(segments.slice(0, wildcard).join("."));
	}
	return { paths, records, parents };
};

/**
 * Recurses with the value's elided fixture path so nested extras a server row
 * carries (`entitlementId`, an expanded `plan`, …) never leak into a fixture
 * the type does not declare. Array entries keep the parent's path; a record's
 * values keep every key, since the keys are the user's data; a path with no
 * declared children at all falls through to `serializeVerbatim`.
 */
const serialize = ({
	value,
	path,
	index,
	indent,
	includeMappings,
}: {
	value: unknown;
	path: string;
	index: PathIndex;
	indent: string;
	includeMappings: boolean;
}): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value === null || value === undefined) return "null";

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map(
			(entry) =>
				`${indent}\t${serialize({ includeMappings, value: entry, path, index, indent: `${indent}\t` })},`,
		);
		return `[\n${items.join("\n")}\n${indent}]`;
	}

	const isRecord = index.records.has(path);
	if (!isRecord && !index.parents.has(path))
		return serializeVerbatim({ value, indent });

	const childPathOf = (key: string): string =>
		isRecord ? `${path}.*` : `${path}.${key}`;
	// A null from the server means unset — omission says the same on the wire.
	const entries = Object.entries(value as Record<string, unknown>).filter(
		([key, entry]) =>
			entry !== undefined &&
			entry !== null &&
			(includeMappings || key !== "processors") &&
			(isRecord || index.paths.has(childPathOf(key))),
	);
	if (entries.length === 0) return "{}";
	const items = entries.map(([key, entry]) => {
		const childPath = childPathOf(key);
		return `${indent}\t${keyText(key)}: ${serialize({ includeMappings, value: entry, path: childPath, index, indent: `${indent}\t` })},`;
	});
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
	// Membership in `plans` stamps true; only a draft's `false` is fixture-worthy.
	if (key === "active") return value === false ? false : undefined;
	return value;
};

/** One top-level fixture property as `key: value` text, or null when the row omits it. */
export const emitFixtureProperty = ({
	spec,
	row,
	key,
	includeMappings,
	indent,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
	key: string;
	includeMappings: boolean;
	indent: string;
}): string | null => {
	const value = rowValueOf({ spec, key, row, includeMappings });
	if (value === undefined || value === null) return null;
	const index = pathIndexOf(spec.paths);
	return serialize({
		includeMappings,
		value,
		path: key,
		index,
		indent: `${indent}\t`,
	});
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
	const index = pathIndexOf(spec.paths);
	const lines: string[] = [`${spec.builder}({`];
	for (const key of spec.keys) {
		const value = rowValueOf({ spec, key, row, includeMappings });
		if (value === undefined || value === null) continue;
		lines.push(
			`${indent}\t${keyText(key)}: ${serialize({ includeMappings, value, path: key, index, indent: `${indent}\t` })},`,
		);
	}
	lines.push(`${indent}})`);
	return lines.join("\n");
};
