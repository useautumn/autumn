import type { MappingProjection } from "./mappingAssignments";

export type CollectionSpec = {
	readonly wireKey?: string;
	readonly mappings?: MappingProjection;
	readonly builder: string;
	readonly idField: string;
	readonly responseIdField: string;
	readonly keys: readonly string[];
	readonly required?: readonly string[];
	readonly paths: readonly string[];
	readonly defaults?: Readonly<Record<string, unknown>>;
	readonly versioned?: boolean;
	readonly pull: boolean;
	readonly deprecated?: readonly { path: string; reason: string }[];
	readonly branches?: readonly BranchSpec[];
};

export type BranchSpec = {
	readonly builder: string;
	readonly key: string;
	readonly idField: string;
	readonly keys: readonly string[];
	readonly required?: readonly string[];
	readonly paths: readonly string[];
	readonly defaults?: Readonly<Record<string, unknown>>;
};

export const branchOf = ({
	spec,
	row,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
}): BranchSpec | undefined =>
	spec.branches?.find((branch) => row[branch.key] !== undefined);

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

export const branchSpecs = ({
	spec,
}: {
	spec: CollectionSpec;
}): CollectionSpec[] =>
	spec.branches?.map((branch) => branchSpecOf({ spec, branch })) ?? [spec];

export type SyncedListSpec = CollectionSpec & {
	readonly wireKey: string;
	readonly envField: string;
};

export type SingletonSpec = {
	readonly wireKey: string;
	readonly fields: readonly {
		readonly key: string;
		readonly wireKey: string;
		readonly default: unknown;
	}[];
};

export type EmitFixtureContext = {
	readonly featureTypes?: Readonly<Record<string, string>>;
	readonly nestedBuilders?: Readonly<Record<string, string>>;
};

const PLAIN_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const keyText = (key: string): string =>
	PLAIN_IDENTIFIER.test(key) ? key : JSON.stringify(key);

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
	records: ReadonlySet<string>;
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

const serialize = ({
	value,
	path,
	index,
	indent,
	includeMappings,
	required,
	context,
}: {
	value: unknown;
	path: string;
	index: PathIndex;
	indent: string;
	includeMappings: boolean;
	required: ReadonlySet<string>;
	context?: EmitFixtureContext;
}): string => {
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	if (value === null || value === undefined) return "null";

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		const nestedBuilder = context?.nestedBuilders?.[path];
		const items = value.map((entry) => {
			const serialized = serialize({
				includeMappings,
				required,
				value: entry,
				path,
				index,
				indent: `${indent}\t`,
				context,
			});
			const fixture =
				nestedBuilder === undefined
					? serialized
					: `${nestedBuilder}(${serialized})`;
			return `${indent}\t${fixture},`;
		});
		return `[\n${items.join("\n")}\n${indent}]`;
	}

	const isRecord = index.records.has(path);
	if (!isRecord && !index.parents.has(path))
		return serializeVerbatim({ value, indent });

	const childPathOf = (key: string): string =>
		isRecord ? `${path}.*` : `${path}.${key}`;
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
		return `${indent}\t${keyText(key)}: ${serialize({ includeMappings, required, value: entry, path: childPath, index, indent: `${indent}\t`, context })},`;
	});
	return `{\n${items.join("\n")}\n${indent}}`;
};

const pruneDefaults = ({
	value,
	path,
	index,
	defaults,
	required,
	context,
}: {
	value: unknown;
	path: string;
	index: PathIndex;
	defaults: Readonly<Record<string, unknown>>;
	required: ReadonlySet<string>;
	context?: EmitFixtureContext;
}): unknown => {
	if (required.has(path)) return value;
	if (path in defaults && valuesEqual(value, defaults[path])) return undefined;
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return value.map(
			(entry) =>
				pruneDefaults({
					value: entry,
					path,
					index,
					defaults,
					required,
					context,
				}) ?? (entry !== null && typeof entry === "object" ? {} : entry),
		);
	}
	const isRecord = index.records.has(path);
	if (!isRecord && !index.parents.has(path)) return value;
	const record = value as Record<string, unknown>;
	const isBooleanFeatureItem =
		typeof record.featureId === "string" &&
		context?.featureTypes?.[record.featureId] === "boolean";
	const pruned: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(record)) {
		if (isBooleanFeatureItem && (key === "included" || key === "unlimited"))
			continue;
		const childPath = isRecord ? `${path}.*` : `${path}.${key}`;
		const child = pruneDefaults({
			value: entry,
			path: childPath,
			index,
			defaults,
			required,
			context,
		});
		if (child !== undefined) pruned[key] = child;
	}
	if (!isRecord && Object.keys(pruned).length === 0 && path !== "")
		return undefined;
	return pruned;
};

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
	if (key === "archived") return undefined;
	if (key === "processors" && !includeMappings) return undefined;
	const value = row[key];
	if (key === "display") return displayOf(value);
	if (key === "creditSchema") return creditSchemaOf(value);
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

export const emitFixtureProperty = ({
	spec: collectionSpec,
	row: collectionRow,
	key,
	includeMappings,
	indent,
	context,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
	key: string;
	includeMappings: boolean;
	indent: string;
	context?: EmitFixtureContext;
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
		context,
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
		context,
	});
};

export const emitNestedFixture = ({
	spec,
	path,
	row,
	includeMappings,
	indent,
	context,
}: {
	spec: CollectionSpec;
	path: string;
	row: Record<string, unknown>;
	includeMappings: boolean;
	indent: string;
	context?: EmitFixtureContext;
}): string => {
	const required = new Set(spec.required ?? []);
	const index = pathIndexOf(spec.paths);
	const value =
		pruneDefaults({
			value: row,
			path,
			index,
			defaults: spec.defaults ?? {},
			required,
			context,
		}) ?? {};
	const serialized = serialize({
		includeMappings,
		required,
		value,
		path,
		index,
		indent,
		context,
	});
	const builder = context?.nestedBuilders?.[path];
	return builder === undefined ? serialized : `${builder}(${serialized})`;
};

export const emitFixture = ({
	spec: collectionSpec,
	row: collectionRow,
	includeMappings,
	indent,
	context,
}: {
	spec: CollectionSpec;
	row: Record<string, unknown>;
	includeMappings: boolean;
	indent: string;
	context?: EmitFixtureContext;
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
			context,
		});
		if (value === undefined) continue;
		if (value === null && !required.has(key)) continue;
		lines.push(
			`${indent}\t${keyText(key)}: ${serialize({ includeMappings, required, value, path: key, index, indent: `${indent}\t`, context })},`,
		);
	}
	lines.push(`${indent}})`);
	return lines.join("\n");
};
