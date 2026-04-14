/**
 * Shape spec describes which fields should be arrays, records, or nested objects
 * so the recursive sanitizer can coerce malformed Redis/Lua JSON payloads.
 *
 * "array"  -> coerce non-arrays to []
 * "record" -> coerce non-objects to {}
 * "nullable_record" -> coerce non-objects to null (for optional record fields)
 * ShapeSpec -> recurse into object fields
 * { items: ShapeSpec } -> coerce field to array, then recurse each element
 */
export interface ShapeSpec {
	[key: string]: FieldRule;
}

export type FieldRule =
	| "array"
	| "record"
	| "nullable_record"
	| ShapeSpec
	| { items: ShapeSpec };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

const coerceArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

const coerceRecord = (value: unknown): Record<string, unknown> =>
	isPlainObject(value) ? value : {};

const coerceNullableRecord = (
	value: unknown,
): Record<string, unknown> | null => (isPlainObject(value) ? value : null);

/**
 * Recursively sanitizes an object against a shape spec.
 * Only touches fields that appear in the spec; all other fields pass through.
 */
export const sanitizeShape = <T>({
	value,
	spec,
}: {
	value: unknown;
	spec: ShapeSpec;
}): T => {
	if (!isPlainObject(value)) return {} as T;

	const result = { ...value } as Record<string, unknown>;

	for (const [key, rule] of Object.entries(spec)) {
		const fieldValue = result[key];

		if (rule === "array") {
			result[key] = coerceArray(fieldValue);
		} else if (rule === "record") {
			result[key] = coerceRecord(fieldValue);
		} else if (rule === "nullable_record") {
			result[key] = coerceNullableRecord(fieldValue);
		} else if (isPlainObject(rule) && "items" in rule) {
			const itemsSpec = (rule as { items: ShapeSpec }).items;
			const arr = coerceArray(fieldValue);
			result[key] = arr.map((item) =>
				sanitizeShape({ value: item, spec: itemsSpec }),
			);
		} else if (isPlainObject(rule) && isPlainObject(fieldValue)) {
			result[key] = sanitizeShape({ value: fieldValue, spec: rule as ShapeSpec });
		}
	}

	return result as T;
};
