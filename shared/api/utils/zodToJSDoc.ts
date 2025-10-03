import type { z } from "zod/v4";
import type { JSDocParam } from "../openApiHelpers.js";

type ZodAnyObject = z.ZodObject<z.ZodRawShape>;
type ZodAnyField = z.ZodTypeAny;

/**
 * Extracts parameter information from a Zod schema to create JSDoc params
 *
 * @param schema - A Zod object schema (e.g., z.object({ ... }))
 * @returns Array of JSDocParam objects with name, description, and optional flag
 *
 * @example
 * ```typescript
 * const AttachSchema = z.object({
 *   customer_id: z.string().describe("The customer ID"),
 *   product_id: z.string().describe("The product ID"),
 *   entity_id: z.string().optional().describe("Optional entity ID"),
 * });
 *
 * const params = extractParamsFromSchema(AttachSchema);
 * // Returns: [
 * //   { name: "customer_id", description: "The customer ID", optional: false },
 * //   { name: "product_id", description: "The product ID", optional: false },
 * //   { name: "entity_id", description: "Optional entity ID", optional: true },
 * // ]
 * ```
 */
export function extractParamsFromSchema(schema: ZodAnyObject): JSDocParam[] {
	const params: JSDocParam[] = [];

	// Get the shape of the object schema
	const shape = schema.shape;

	for (const [fieldName, fieldSchema] of Object.entries(shape)) {
		const zodField = fieldSchema as ZodAnyField;

		// Extract description from .describe() or .meta()
		let description = "";
		// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
		const def = (zodField as any)._def;
		if (zodField.description) {
			description = zodField.description;
		} else if (def?.description) {
			description = def.description;
		}

		// Check if field is optional/nullable
		const isOptional = isZodFieldOptional(zodField);

		// Only add params that have descriptions (to avoid cluttering docs)
		if (description) {
			params.push({
				name: fieldName,
				description,
				optional: isOptional,
			});
		}
	}

	return params;
}

/**
 * Checks if a Zod field is optional or nullable
 */
function isZodFieldOptional(field: ZodAnyField): boolean {
	// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
	const def = (field as any)._def;

	// Check for .optional()
	if (def?.typeName === "ZodOptional") {
		return true;
	}

	// Check for .nullish()
	if (def?.typeName === "ZodNullable") {
		return true;
	}

	// Check if it's wrapped in optional/nullable
	if (def?.innerType) {
		return isZodFieldOptional(def.innerType);
	}

	// Check for default values (also makes it optional)
	if (def?.defaultValue !== undefined) {
		return true;
	}

	return false;
}

/**
 * Creates a filtered list of params from a schema, including only specified fields
 *
 * @param schema - A Zod object schema
 * @param includeFields - Array of field names to include in the output
 * @returns Filtered array of JSDocParam objects
 *
 * @example
 * ```typescript
 * const params = filterSchemaParams(AttachSchema, [
 *   'customer_id',
 *   'product_id',
 *   'entity_id'
 * ]);
 * ```
 */
export function filterSchemaParams(
	schema: ZodAnyObject,
	includeFields: string[],
): JSDocParam[] {
	const allParams = extractParamsFromSchema(schema);
	return allParams.filter((param) => includeFields.includes(param.name));
}
