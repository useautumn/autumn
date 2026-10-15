import type { z } from "zod/v4";

type SchemaDef = {
	type: string;
	innerType?: z.ZodType;
	in?: z.ZodType;
	element?: z.ZodType;
	valueType?: z.ZodType;
	options?: z.ZodType[];
	left?: z.ZodType;
	right?: z.ZodType;
	shape?: Record<string, z.ZodType>;
};

const WRAPPER_TYPES = new Set([
	"optional",
	"default",
	"prefault",
	"readonly",
	"nonoptional",
	"catch",
]);

const defOf = (schema: z.ZodType): SchemaDef =>
	(schema as unknown as { _zod: { def: SchemaDef } })._zod.def;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Every object shape a schema states, through wrappers, pipes and intersections. */
const shapeOf = (schema: z.ZodType): Record<string, z.ZodType> | null => {
	const def = defOf(schema);
	if (def.type === "object") return def.shape ?? {};
	if (WRAPPER_TYPES.has(def.type) || def.type === "nullable")
		return def.innerType ? shapeOf(def.innerType) : null;
	if (def.type === "pipe") return def.in ? shapeOf(def.in) : null;
	if (def.type === "intersection" && def.left && def.right) {
		const left = shapeOf(def.left);
		const right = shapeOf(def.right);
		if (!left && !right) return null;
		return { ...right, ...left };
	}
	return null;
};

/** The union branch naming the most of the value's keys. */
const matchingOption = ({
	options,
	value,
}: {
	options: z.ZodType[];
	value: Record<string, unknown>;
}): z.ZodType | undefined => {
	let best: { option: z.ZodType; hits: number } | undefined;
	for (const option of options) {
		const shape = shapeOf(option);
		if (!shape) continue;
		const hits = Object.keys(value).filter((key) => key in shape).length;
		if (hits > 0 && (!best || hits > best.hits)) best = { option, hits };
	}
	return best?.option;
};

/**
 * Keeps only what `schema` accepts as input: undeclared keys go, and so does a
 * null where the schema is not nullable. `omitKeys` are dropped at every depth.
 */
export const projectOntoSchema = ({
	schema,
	value,
	omitKeys,
}: {
	schema: z.ZodType;
	value: unknown;
	omitKeys: ReadonlySet<string>;
}): unknown => {
	if (value === undefined) return undefined;
	const def = defOf(schema);
	const project = (next: z.ZodType | undefined, nextValue: unknown) =>
		next
			? projectOntoSchema({ schema: next, value: nextValue, omitKeys })
			: nextValue;

	if (def.type === "nullable")
		return value === null ? null : project(def.innerType, value);
	if (WRAPPER_TYPES.has(def.type)) return project(def.innerType, value);
	if (value === null) return undefined;
	if (def.type === "pipe") return project(def.in, value);

	if (def.type === "array" && Array.isArray(value))
		return value
			.map((entry) => project(def.element, entry))
			.filter((entry) => entry !== undefined);

	if (def.type === "record" && isPlainObject(value))
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				project(def.valueType, entry),
			]),
		);

	if (def.type === "union" && isPlainObject(value)) {
		const option = matchingOption({ options: def.options ?? [], value });
		return option ? project(option, value) : value;
	}

	const shape = shapeOf(schema);
	if (!shape || !isPlainObject(value)) return value;
	const projected: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (omitKeys.has(key) || !(key in shape)) continue;
		const kept = project(shape[key], entry);
		if (kept !== undefined) projected[key] = kept;
	}
	return projected;
};
