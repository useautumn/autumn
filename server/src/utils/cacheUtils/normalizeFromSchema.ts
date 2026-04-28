/** biome-ignore-all lint/suspicious/noExplicitAny: accessing Zod internal properties */
import type { z } from "zod/v4";

/**
 * Normalize data from Redis cache to fix cjson quirks.
 *
 * Different Redis providers handle cjson.encode differently:
 * - Empty objects {} may become empty arrays []
 * - null values may become undefined
 * - Empty arrays [] may become empty objects {}
 *
 * This function dynamically normalizes data based on a Zod schema structure.
 */

const getSchemaType = (schema: z.ZodTypeAny): string | undefined => {
	return (schema as any)._def?.type;
};

const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
	const type = getSchemaType(schema);
	const def = (schema as any)._def;

	if (type === "optional") return unwrapSchema(def.innerType);
	if (type === "nullable") return unwrapSchema(def.innerType);
	if (type === "effects") return unwrapSchema(def.schema);
	if (type === "default") return unwrapSchema(def.innerType);

	return schema;
};

const isNullable = (schema: z.ZodTypeAny): boolean => {
	const type = getSchemaType(schema);
	const def = (schema as any)._def;

	if (type === "nullable") return true;

	if (type === "optional" || type === "effects" || type === "default") {
		const innerSchema = def.innerType || def.schema;
		return isNullable(innerSchema);
	}

	return false;
};

const isEmptyObject = (value: unknown): boolean => {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).length === 0
	);
};

/** Normalize cjson empty table to array. */
export const normalizeToArray = (value: unknown): unknown[] => {
	if (Array.isArray(value)) return value;
	if (value && typeof value === "object" && Object.keys(value).length === 0)
		return [];
	return [];
};

/** Dynamically normalize data based on Zod schema structure. */
export const normalizeFromSchema = <T>({
	schema,
	data,
}: {
	schema: z.ZodTypeAny;
	data: unknown;
}): T => {
	if (data === undefined && isNullable(schema)) {
		return null as T;
	}

	const unwrapped = unwrapSchema(schema);
	const type = getSchemaType(unwrapped);

	if (type === "record") {
		if (Array.isArray(data) && data.length === 0) {
			return {} as T;
		}

		if (data && typeof data === "object" && !Array.isArray(data)) {
			const valueSchema = (unwrapped as any)._def.valueType;
			const normalized: Record<string, unknown> = {};

			for (const key in data as Record<string, unknown>) {
				normalized[key] = normalizeFromSchema({
					schema: valueSchema,
					data: (data as Record<string, unknown>)[key],
				});
			}

			return normalized as T;
		}
	}

	if (type === "array") {
		if (isEmptyObject(data)) {
			return [] as T;
		}

		if (Array.isArray(data)) {
			const itemSchema = (unwrapped as any)._def.element;
			return data.map((item) =>
				normalizeFromSchema({ schema: itemSchema, data: item }),
			) as T;
		}
	}

	if (type === "object") {
		// Upstash Lua cjson collapses empty `{}` to `[]`; treat as empty object
		// so nested defaults still get applied on round-trip.
		const objectData =
			Array.isArray(data) && data.length === 0 ? {} : data;
		if (
			!objectData ||
			typeof objectData !== "object" ||
			Array.isArray(objectData)
		) {
			return data as T;
		}

		const shape = (unwrapped as any)._def.shape;
		const normalized: Record<string, unknown> = {
			...(objectData as Record<string, unknown>),
		};

		for (const key in shape) {
			normalized[key] = normalizeFromSchema({
				schema: shape[key],
				data: normalized[key],
			});
		}

		return normalized as T;
	}

	return data as T;
};
