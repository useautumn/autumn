import { z } from "zod/v4";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValueSchema),
		z.record(z.string(), jsonValueSchema),
	]),
);

export const propertiesSchema = z
	.record(z.string(), jsonValueSchema)
	.nullable();

export const canonicalizeJsonValue = (value: JsonValue): JsonValue => {
	if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
	if (value === null || typeof value !== "object") return value;

	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, canonicalizeJsonValue(entry)]),
	);
};
