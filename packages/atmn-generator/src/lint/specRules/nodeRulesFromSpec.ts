import {
	isFreeFormSchema,
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
} from "../../casing/schemaKeyCasing";
import { isInternalField, type Overlay } from "../../overlay/overlay";
import { resolveRef } from "../../spec/resolveRef";
import type {
	FieldConstraints,
	NodeRules,
	ShapeRules,
} from "../runtime/lintDocument";

/**
 * Every constraint zod emitted into the spec, keyed by fixture path with array
 * indices elided. `allOf` branches are AND, so they merge; `anyOf`/`oneOf`
 * branches are alternatives, so they become variants chosen by a discriminating
 * const, or intersect when there is none — never a false positive either way.
 */

export type SpecNodeRules = Pick<
	NodeRules,
	"required" | "fields" | "keys" | "variants"
>;

const CONSTRAINT_KEYS = [
	"minimum",
	"maximum",
	"exclusiveMinimum",
	"exclusiveMaximum",
	"minLength",
	"maxLength",
	"minItems",
	"maxItems",
	"pattern",
] as const;

type Shape = {
	required: Set<string>;
	fields: Record<string, FieldConstraints>;
	keys?: FieldConstraints;
	variants?: NodeRules["variants"];
	/** Segments to descend into: a property name, or `*` for a record's values. */
	children: [string, JsonSchema][];
};

const emptyShape = (): Shape => ({
	required: new Set(),
	fields: {},
	children: [],
});

const nonEmpty = <T extends object>(value: T): T | undefined =>
	Object.keys(value).length > 0 ? value : undefined;

const isNullBranch = (schema: JsonSchema): boolean => schema.type === "null";

const alternativesOf = ({
	schema,
	root,
}: {
	schema: JsonSchema;
	root: JsonSchema;
}): JsonSchema[] =>
	[...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
		.map((branch) => resolveRef({ schema: branch, root }) ?? branch)
		.filter((branch) => !isNullBranch(branch));

const ownConstraints = (schema: JsonSchema): FieldConstraints | undefined => {
	const out: Record<string, unknown> = {};
	if (Array.isArray(schema.enum)) out.enum = schema.enum;
	else if (schema.const !== undefined) out.enum = [schema.const];
	for (const key of CONSTRAINT_KEYS) {
		if (schema[key] !== undefined) out[key] = schema[key];
	}
	return nonEmpty(out) as FieldConstraints | undefined;
};

const sameValue = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

/**
 * Across alternatives, a bound is kept only when every branch of that TYPE
 * agrees on it — the runtime guards on type, so a number's minimum cannot
 * misfire on the string branch. `enum` is kept only when every branch has one.
 */
const mergeAlternativeConstraints = (
	branches: { type: string; constraints: FieldConstraints | undefined }[],
): FieldConstraints | undefined => {
	const merged: Record<string, unknown> = {};
	const types = [...new Set(branches.map((branch) => branch.type))];

	for (const type of types) {
		const group = branches
			.filter((branch) => branch.type === type)
			.map((branch) => branch.constraints ?? {});
		for (const key of CONSTRAINT_KEYS) {
			const values = group.map((constraints) => constraints[key]);
			const first = values[0];
			if (first === undefined) continue;
			if (values.every((value) => sameValue(value, first))) merged[key] = first;
		}
	}

	const enums = branches.map((branch) => branch.constraints?.enum);
	if (enums.length > 0 && enums.every((values) => values !== undefined)) {
		merged.enum = [...new Set(enums.flatMap((values) => [...(values ?? [])]))];
	}

	return nonEmpty(merged) as FieldConstraints | undefined;
};

const constraintsOf = ({
	schema,
	root,
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema;
}): FieldConstraints | undefined => {
	const resolved = resolveRef({ schema, root });
	if (!resolved) return undefined;
	const alternatives = alternativesOf({ schema: resolved, root });
	if (alternatives.length === 0) return ownConstraints(resolved);
	if (alternatives.length === 1)
		return constraintsOf({ schema: alternatives[0], root });
	return mergeAlternativeConstraints(
		alternatives.map((branch) => ({
			type: typeof branch.type === "string" ? branch.type : "?",
			constraints: constraintsOf({ schema: branch, root }),
		})),
	);
};

const mergeInto = ({ target, source }: { target: Shape; source: Shape }) => {
	for (const field of source.required) target.required.add(field);
	for (const [field, constraints] of Object.entries(source.fields)) {
		if (target.fields[field] === undefined) target.fields[field] = constraints;
	}
	target.keys ??= source.keys;
	target.variants ??= source.variants;
	target.children.push(...source.children);
};

const shapeRulesOf = (shape: Shape): ShapeRules => {
	const out: {
		required?: string[];
		fields?: Record<string, FieldConstraints>;
	} = {};
	if (shape.required.size > 0) out.required = [...shape.required].sort();
	if (Object.keys(shape.fields).length > 0) out.fields = shape.fields;
	return out;
};

const hasContent = (shape: Shape): boolean =>
	shape.required.size > 0 ||
	Object.keys(shape.fields).length > 0 ||
	shape.keys !== undefined ||
	shape.variants !== undefined;

/** Fields present in every branch, with the constraints they all agree on. */
const intersectShapes = (shapes: Shape[]): Shape => {
	const [first, ...rest] = shapes;
	if (!first) return emptyShape();
	const out = emptyShape();
	for (const field of first.required) {
		if (rest.every((shape) => shape.required.has(field)))
			out.required.add(field);
	}
	for (const [field, constraints] of Object.entries(first.fields)) {
		if (rest.every((shape) => sameValue(shape.fields[field], constraints)))
			out.fields[field] = constraints;
	}
	return out;
};

/** A field that exactly one value pins per branch — `tierBehavior: "graduated"`. */
const discriminatorOf = (shapes: Shape[]): string | undefined => {
	const candidates = new Set(
		shapes.flatMap((shape) => Object.keys(shape.fields)),
	);
	for (const field of [...candidates].sort()) {
		const pinned = shapes
			.map((shape) => shape.fields[field]?.enum)
			.filter((values): values is readonly unknown[] => values !== undefined);
		if (pinned.length === 0) continue;
		const singletons = pinned.every((values) => values.length === 1);
		const distinct =
			new Set(pinned.map((values) => String(values[0]))).size === pinned.length;
		if (singletons && distinct) return field;
	}
	return undefined;
};

const variantsOf = (
	shapes: Shape[],
): Pick<Shape, "variants"> & { merged?: Shape } => {
	const on = discriminatorOf(shapes);
	if (!on) return { merged: intersectShapes(shapes) };

	const byValue: Record<string, ShapeRules> = {};
	const unpinned: Shape[] = [];
	for (const shape of shapes) {
		const value = shape.fields[on]?.enum?.[0];
		if (value === undefined) {
			unpinned.push(shape);
			continue;
		}
		byValue[String(value)] = shapeRulesOf(shape);
	}
	const fallback =
		unpinned.length > 0 ? shapeRulesOf(intersectShapes(unpinned)) : undefined;
	return { variants: { on, byValue, ...(fallback ? { fallback } : {}) } };
};

const EXPOSE_NOTHING: Overlay = { collections: {}, exposeInternal: [] };

const shapeOf = ({
	schema,
	root,
	overlay,
}: {
	schema: JsonSchema | undefined;
	root: JsonSchema;
	overlay: Overlay;
}): Shape => {
	const resolved = resolveRef({ schema, root });
	const shape = emptyShape();
	if (!resolved) return shape;

	if (isRecordSchema(resolved)) {
		const valueSchema = resolved.additionalProperties as JsonSchema;
		const keys = constraintsOf({
			schema: resolved.propertyNames as JsonSchema | undefined,
			root,
		});
		if (keys) shape.keys = keys;
		if (!isFreeFormSchema(valueSchema)) shape.children.push(["*", valueSchema]);
		return shape;
	}

	const internal = new Set<string>();
	for (const [wireKey, property] of Object.entries(resolved.properties ?? {})) {
		if (isInternalField({ overlay, wireKey, schema: property })) {
			internal.add(wireKey);
			continue;
		}
		const name = toCamelCase(wireKey);
		const constraints = constraintsOf({ schema: property, root });
		if (constraints) shape.fields[name] = constraints;
		shape.children.push([name, property]);
	}
	for (const wireKey of (resolved.required as string[] | undefined) ?? []) {
		if (!internal.has(wireKey)) shape.required.add(toCamelCase(wireKey));
	}

	for (const branch of resolved.allOf ?? []) {
		mergeInto({
			target: shape,
			source: shapeOf({ schema: branch, root, overlay }),
		});
	}

	const alternatives = alternativesOf({ schema: resolved, root }).map(
		(branch) => shapeOf({ schema: branch, root, overlay }),
	);
	for (const alternative of alternatives)
		shape.children.push(...alternative.children);

	const contentful = alternatives.filter(hasContent);
	if (contentful.length === 1 && contentful[0]) {
		mergeInto({
			target: shape,
			source: { ...contentful[0], children: [] },
		});
	} else if (contentful.length > 1) {
		const { variants, merged } = variantsOf(contentful);
		if (variants) shape.variants = variants;
		if (merged)
			mergeInto({ target: shape, source: { ...merged, children: [] } });
	}

	return shape;
};

const specRulesOf = (shape: Shape): SpecNodeRules | undefined => {
	const out: Record<string, unknown> = { ...shapeRulesOf(shape) };
	if (shape.keys) out.keys = shape.keys;
	if (shape.variants) out.variants = shape.variants;
	return nonEmpty(out) as SpecNodeRules | undefined;
};

/** Two branches naming the same path with different rules keep only what agrees. */
const intersectSpecRules = (
	a: SpecNodeRules,
	b: SpecNodeRules,
): SpecNodeRules => {
	if (sameValue(a, b)) return a;
	const out: Record<string, unknown> = {};
	const required = (a.required ?? []).filter((field) =>
		(b.required ?? []).includes(field),
	);
	if (required.length > 0) out.required = required;
	const fields = Object.fromEntries(
		Object.entries(a.fields ?? {}).filter(([field, constraints]) =>
			sameValue(b.fields?.[field], constraints),
		),
	);
	if (Object.keys(fields).length > 0) out.fields = fields;
	if (sameValue(a.keys, b.keys) && a.keys) out.keys = a.keys;
	if (sameValue(a.variants, b.variants) && a.variants)
		out.variants = a.variants;
	return out as SpecNodeRules;
};

export const nodeRulesFromSpec = ({
	schema,
	root,
	overlay = EXPOSE_NOTHING,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay?: Overlay;
}): Record<string, SpecNodeRules> => {
	const out: Record<string, SpecNodeRules> = {};

	const emit = ({ path, rules }: { path: string; rules: SpecNodeRules }) => {
		const existing = out[path];
		out[path] = existing ? intersectSpecRules(existing, rules) : rules;
	};

	const visit = ({
		schema: node,
		path,
		seen,
	}: {
		schema: JsonSchema | undefined;
		path: string;
		seen: Set<JsonSchema>;
	}): void => {
		const resolved = resolveRef({ schema: node, root });
		if (!resolved || seen.has(resolved)) return;
		const nextSeen = new Set(seen).add(resolved);

		if (resolved.items) {
			visit({ schema: resolved.items, path, seen: nextSeen });
			return;
		}

		const shape = shapeOf({ schema: resolved, root, overlay });
		const rules = specRulesOf(shape);
		if (rules) emit({ path, rules });

		for (const [segment, child] of shape.children) {
			visit({
				schema: child,
				path: path ? `${path}.${segment}` : segment,
				seen: nextSeen,
			});
		}
	};

	visit({ schema, path: "", seen: new Set() });

	return Object.fromEntries(
		Object.keys(out)
			.sort()
			.map((path) => [path, out[path] as SpecNodeRules]),
	);
};
