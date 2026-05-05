import { z } from "zod/v4";

/**
 * Normalize cached JSON against a Zod schema to repair Upstash cjson quirks.
 *
 * Upstash's Lua cjson (Go-backed) differs from standard Redis Lua:
 *   - JSON `null` decodes to Lua `nil` (dropped on re-encode).
 *   - Empty JS objects/arrays both become `{}` after a Lua round-trip.
 *
 * Walks the schema and fills holes at nullable positions, and swaps
 * empty-object/empty-array when the schema says otherwise. Never throws,
 * never re-validates — this is a cleanup pass, not a `.parse()`.
 */

type ZodSchema = z.core.$ZodType;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

const isEmptyObject = (value: unknown): boolean =>
	isPlainObject(value) && Object.keys(value).length === 0;

const isEmptyArray = (value: unknown): boolean =>
	Array.isArray(value) && value.length === 0;

/**
 * True if the schema's wrapper chain contains `ZodNullable`. Walks through
 * `ZodOptional` / `ZodDefault` / `ZodPipe` so `.nullish()` (optional→nullable)
 * and `.nullable().default(x)` both report as nullable.
 */
const isNullable = (schema: ZodSchema): boolean => {
	if (schema instanceof z.ZodNullable) return true;
	if (schema instanceof z.ZodOptional) return isNullable(schema._def.innerType);
	if (schema instanceof z.ZodDefault) return isNullable(schema._def.innerType);
	if (schema instanceof z.ZodPipe)
		return isNullable(schema._def.in) || isNullable(schema._def.out);
	return false;
};

/**
 * Strip wrapper layers to reveal the payload-shaping schema
 * (`ZodObject` / `ZodArray` / `ZodRecord` / leaf).
 */
const unwrapSchema = (schema: ZodSchema): ZodSchema => {
	if (schema instanceof z.ZodNullable)
		return unwrapSchema(schema._def.innerType);
	if (schema instanceof z.ZodOptional)
		return unwrapSchema(schema._def.innerType);
	if (schema instanceof z.ZodDefault)
		return unwrapSchema(schema._def.innerType);
	if (schema instanceof z.ZodPipe) return unwrapSchema(schema._def.in);
	return schema;
};

/**
 * If `undefined` hits a `ZodDefault` anywhere in the wrapper chain, return
 * its default value. v4 exposes `defaultValue` as a direct value, not a thunk.
 */
const applyDefaultIfUndefined = (
	schema: ZodSchema,
	value: unknown,
): { applied: true; value: unknown } | { applied: false } => {
	if (value !== undefined) return { applied: false };

	if (schema instanceof z.ZodDefault) {
		return { applied: true, value: schema._def.defaultValue };
	}
	if (schema instanceof z.ZodOptional)
		return applyDefaultIfUndefined(schema._def.innerType, value);
	if (schema instanceof z.ZodNullable)
		return applyDefaultIfUndefined(schema._def.innerType, value);
	if (schema instanceof z.ZodPipe)
		return applyDefaultIfUndefined(schema._def.in, value);

	return { applied: false };
};

const normalize = (schema: ZodSchema, data: unknown): unknown => {
	if (data === undefined) {
		const defaultResult = applyDefaultIfUndefined(schema, data);
		if (defaultResult.applied)
			return normalize(unwrapSchema(schema), defaultResult.value);
		if (isNullable(schema)) return null;
		return data;
	}

	const unwrapped = unwrapSchema(schema);

	if (unwrapped instanceof z.ZodObject) {
		// Upstash Lua cjson collapses empty `{}` to `[]`; treat as empty object
		// so nested defaults (e.g. ProductConfigSchema) still get applied.
		const objectData = isEmptyArray(data) ? {} : data;
		if (!isPlainObject(objectData)) return data;

		const shape = unwrapped._def.shape;
		const normalized: Record<string, unknown> = { ...objectData };
		for (const key of Object.keys(shape)) {
			normalized[key] = normalize(shape[key], normalized[key]);
		}
		return normalized;
	}

	if (unwrapped instanceof z.ZodArray) {
		if (isEmptyObject(data)) return [];
		if (!Array.isArray(data)) return data;

		const element = unwrapped._def.element;
		return data.map((item) => normalize(element, item));
	}

	if (unwrapped instanceof z.ZodRecord) {
		if (isEmptyArray(data)) return {};
		if (!isPlainObject(data)) return data;

		const valueType = unwrapped._def.valueType;
		const normalized: Record<string, unknown> = {};
		for (const key of Object.keys(data)) {
			normalized[key] = normalize(valueType, data[key]);
		}
		return normalized;
	}

	return data;
};

export const normalizeFromSchema = <T>({
	schema,
	data,
}: {
	schema: ZodSchema;
	data: unknown;
}): T => normalize(schema, data) as T;
