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

/**
 * Get the type string from a Zod schema's _def
 */
const getSchemaType = (schema: z.ZodTypeAny): string | undefined => {
	return (schema as any)._def?.type;
};

/**
 * Unwrap optional/nullable/effects to get the inner schema
 */
const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
	const type = getSchemaType(schema);
	const def = (schema as any)._def;

	// Unwrap optional → innerType
	if (type === "optional") {
		return unwrapSchema(def.innerType);
	}

	// Unwrap nullable → innerType
	if (type === "nullable") {
		return unwrapSchema(def.innerType);
	}

	// Unwrap effects (transform, refine, etc.) → schema
	if (type === "effects") {
		return unwrapSchema(def.schema);
	}

	// Unwrap default → innerType
	if (type === "default") {
		return unwrapSchema(def.innerType);
	}

	return schema;
};

/**
 * Check if schema allows null values (has .nullable() wrapper)
 */
const isNullable = (schema: z.ZodTypeAny): boolean => {
	const type = getSchemaType(schema);
	const def = (schema as any)._def;

	if (type === "nullable") {
		return true;
	}

	// Check wrapped types
	if (type === "optional" || type === "effects" || type === "default") {
		const innerSchema = def.innerType || def.schema;
		return isNullable(innerSchema);
	}

	return false;
};

/**
 * Check if a value is an empty object (not an array)
 */
const isEmptyObject = (value: unknown): boolean => {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.keys(value).length === 0
	);
};

/**
 * Dynamically normalize data based on Zod schema structure.
 * Handles Redis cjson quirks by walking the schema and fixing data accordingly.
 */
export const normalizeFromSchema = <T>({
	schema,
	data,
}: {
	schema: z.ZodTypeAny;
	data: unknown;
}): T => {
	// Step 1: Check if data is undefined and field is nullable → convert to null
	if (data === undefined && isNullable(schema)) {
		return null as T;
	}

	// Step 2: Unwrap schema to get the base type
	const unwrapped = unwrapSchema(schema);
	const type = getSchemaType(unwrapped);

	// Step 3: Handle each Zod type

	// RECORD (object with dynamic keys)
	if (type === "record") {
		// If data is an empty array, convert to empty object
		if (Array.isArray(data) && data.length === 0) {
			return {} as T;
		}

		// If data is a valid object, recursively normalize values
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

	// ARRAY
	if (type === "array") {
		// If data is an empty object, convert to empty array
		if (isEmptyObject(data)) {
			return [] as T;
		}

		// If data is a valid array, recursively normalize items
		if (Array.isArray(data)) {
			const itemSchema = (unwrapped as any)._def.element;
			return data.map((item) =>
				normalizeFromSchema({ schema: itemSchema, data: item }),
			) as T;
		}
	}

	// OBJECT (with defined shape)
	if (type === "object") {
		// If data is not an object, return as-is
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			return data as T;
		}

		// Recursively normalize all fields in the object
		const shape = (unwrapped as any)._def.shape;
		const normalized: Record<string, unknown> = {
			...(data as Record<string, unknown>),
		};

		for (const key in shape) {
			// Hardcoded fix: scheduled_subscriptions should be an array, never null/undefined
			if (
				key === "scheduled_subscriptions" &&
				(normalized[key] === undefined || normalized[key] === null)
			) {
				normalized[key] = [];
			} else {
				normalized[key] = normalizeFromSchema({
					schema: shape[key],
					data: normalized[key],
				});
			}
		}

		return normalized as T;
	}

	// For all other types (string, number, boolean, etc.), return as-is
	return data as T;
};
