// Copied by @autumn/atmn-generator from packages/atmn-generator/src/emit/runtime/emitFixture.ts.
// Do not edit — change that file and run `bun generate` instead.

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
	/** Fixture paths the type demands: written even when the row's value is null. */
	readonly required?: readonly string[];
	/** Every fixture path a config may state, collection-relative (no `entitlementId`, `versioning`, …). */
	readonly paths: readonly string[];
	/** The spec's default at each fixture path that states one; a pulled value equal to it is left out. */
	readonly defaults?: Readonly<Record<string, unknown>>;
	/** Config key holding past versions, when the collection has history. */
	readonly historyKey?: string;
	/** Whether pull can address entries by idField alone. */
	readonly pull: boolean;
	/** Wire-named, item-rooted paths kept for existing catalogs only. */
	readonly deprecated?: readonly { path: string; reason: string }[];
	/** Set when the item is a union: one builder per branch, keyed by its wrapper. */
	readonly branches?: readonly BranchSpec[];
};

/** One branch of a union item: the fixture lives under `key`, not at the root. */
export type BranchSpec = {
	readonly builder: string;
	readonly key: string;
	readonly idField: string;
	readonly keys: readonly string[];
	readonly required?: readonly string[];
	readonly paths: readonly string[];
	readonly defaults?: Readonly<Record<string, unknown>>;
};

/** The branch an entry or row states, or undefined when it states none. */
export const branchOf = ({
	spec,
	row,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
}): BranchSpec | undefined =>
	spec.branches?.find((branch) => row[branch.key] !== undefined);

/**
 * A branched row read as if its branch were the whole collection: the builder,
 * keys and paths become the branch's and the body becomes the row, so
 * everything downstream stays union-blind.
 */
export const resolveBranch = ({
	spec,
	row,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
}): { spec: CollectionSpec; row: Record<string, unknown> } => {
	const branch = branchOf({ spec, row });
	if (!branch) return { spec, row };
	return {
		spec: branchSpecOf({ spec, branch }),
		row: row[branch.key] as Record<string, unknown>,
	};
};

const branchSpecOf = ({
	spec,
	branch,
}: {
	spec: CollectionSpec;
	branch: BranchSpec;
}): CollectionSpec => ({
	...spec,
	builder: branch.builder,
	idField: branch.idField,
	responseIdField: branch.idField,
	keys: branch.keys,
	required: branch.required,
	paths: branch.paths,
	defaults: branch.defaults,
	branches: undefined,
});

/** Every shape an entry of the collection can take; just itself when unbranched. */
export const branchSpecs = ({
	spec,
}: {
	spec: CollectionSpec;
}): CollectionSpec[] =>
	spec.branches?.map((branch) => branchSpecOf({ spec, branch })) ?? [spec];

export type SingletonSpec = {
	/** The request-body field the object is sent as. */
	readonly wireKey: string;
	/** Fixture key, wire key and the server's default, in spec order. */
	readonly fields: readonly {
		readonly key: string;
		readonly wireKey: string;
		readonly default: unknown;
	}[];
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
	required,
}: {
	value: unknown;
	path: string;
	index: PathIndex;
	indent: string;
	includeMappings: boolean;
	required: ReadonlySet<string>;
}): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value === null || value === undefined) return "null";

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const items = value.map(
			(entry) =>
				`${indent}\t${serialize({ includeMappings, required, value: entry, path, index, indent: `${indent}\t` })},`,
		);
		return `[\n${items.join("\n")}\n${indent}]`;
	}

	const isRecord = index.records.has(path);
	if (!isRecord && !index.parents.has(path))
		return serializeVerbatim({ value, indent });

	const childPathOf = (key: string): string =>
		isRecord ? `${path}.*` : `${path}.${key}`;
	// A null from the server means unset, and omission says the same on the wire
	// — unless the fixture type demands the key, which omission would not compile.
	const entries = Object.entries(value as Record<string, unknown>).filter(
		([key, entry]) =>
			entry !== undefined &&
			(entry !== null || required.has(childPathOf(key))) &&
			(includeMappings || key !== "processors") &&
			(isRecord || index.paths.has(childPathOf(key))),
	);
	if (entries.length === 0) return "{}";
	const items = entries.map(([key, entry]) => {
		const childPath = childPathOf(key);
		return `${indent}\t${keyText(key)}: ${serialize({ includeMappings, required, value: entry, path: childPath, index, indent: `${indent}\t` })},`;
	});
	return `{\n${items.join("\n")}\n${indent}}`;
};

/**
 * A value at its spec default reads the same when omitted, so it is not
 * written; a container whose every child was elided is not written either.
 * `items` and other arrays carry no default, so an empty one still states
 * "none". A path the type demands is kept whatever its value.
 */
const pruneDefaults = ({
	value,
	path,
	index,
	defaults,
	required,
}: {
	value: unknown;
	path: string;
	index: PathIndex;
	defaults: Readonly<Record<string, unknown>>;
	required: ReadonlySet<string>;
}): unknown => {
	if (required.has(path)) return value;
	if (path in defaults && valuesEqual(value, defaults[path])) return undefined;
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return value.map((entry) =>
			pruneDefaults({ value: entry, path, index, defaults, required }),
		);
	}
	const isRecord = index.records.has(path);
	if (!isRecord && !index.parents.has(path)) return value;
	const pruned: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		const childPath = isRecord ? `${path}.*` : `${path}.${key}`;
		const child = pruneDefaults({
			value: entry,
			path: childPath,
			index,
			defaults,
			required,
		});
		if (child !== undefined) pruned[key] = child;
	}
	// An object the spec describes that ends up empty said nothing; a record
	// (metadata) is the user's data and stays whatever it holds.
	if (!isRecord && Object.keys(pruned).length === 0 && path !== "")
		return undefined;
	return pruned;
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
	// A deprecated field is kept only while it carries data.
	if (
		isDeprecatedKey({ spec, key }) &&
		Array.isArray(value) &&
		value.length === 0
	)
		return undefined;
	return value;
};

const valuesEqual = (left: unknown, right: unknown): boolean => {
	if (Object.is(left, right)) return true;
	if (
		typeof left !== "object" ||
		typeof right !== "object" ||
		left === null ||
		right === null
	)
		return false;
	if (Array.isArray(left) !== Array.isArray(right)) return false;
	const leftRecord = left as Record<string, unknown>;
	const rightRecord = right as Record<string, unknown>;
	const keys = new Set([
		...Object.keys(leftRecord),
		...Object.keys(rightRecord),
	]);
	for (const key of keys) {
		if (!valuesEqual(leftRecord[key], rightRecord[key])) return false;
	}
	return true;
};

const isDeprecatedKey = ({
	spec,
	key,
}: {
	spec: CollectionSpec;
	key: string;
}): boolean =>
	(spec.deprecated ?? []).some((entry) => camelOf(entry.path) === key);

const camelOf = (snake: string): string =>
	snake.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** One top-level fixture property as `key: value` text, or null when the row omits it. */
export const emitFixtureProperty = ({
	spec: collectionSpec,
	row: collectionRow,
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
	const { spec, row } = resolveBranch({
		spec: collectionSpec,
		row: collectionRow,
	});
	const required = new Set(spec.required ?? []);
	const index = pathIndexOf(spec.paths);
	const value = pruneDefaults({
		value: rowValueOf({ spec, key, row, includeMappings }),
		path: key,
		index,
		defaults: spec.defaults ?? {},
		required,
	});
	if (value === undefined) return null;
	if (value === null && !required.has(key)) return null;
	return serialize({
		includeMappings,
		required,
		value,
		path: key,
		index,
		indent: `${indent}\t`,
	});
};

export const emitFixture = ({
	spec: collectionSpec,
	row: collectionRow,
	includeMappings,
	indent,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
	includeMappings: boolean;
	indent: string;
}): string => {
	const { spec, row } = resolveBranch({
		spec: collectionSpec,
		row: collectionRow,
	});
	const index = pathIndexOf(spec.paths);
	const required = new Set(spec.required ?? []);
	const lines: string[] = [`${spec.builder}({`];
	for (const key of spec.keys) {
		const value = pruneDefaults({
			value: rowValueOf({ spec, key, row, includeMappings }),
			path: key,
			index,
			defaults: spec.defaults ?? {},
			required,
		});
		if (value === undefined) continue;
		// A required key states null rather than vanishing: the fixture type
		// demands it, so dropping it emits source that does not compile.
		if (value === null && !required.has(key)) continue;
		lines.push(
			`${indent}\t${keyText(key)}: ${serialize({ includeMappings, required, value, path: key, index, indent: `${indent}\t` })},`,
		);
	}
	lines.push(`${indent}})`);
	return lines.join("\n");
};
