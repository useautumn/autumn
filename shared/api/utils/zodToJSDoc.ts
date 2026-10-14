import type { z } from "zod/v4";
import type { JSDocParam } from "./openApiHelpers.js";

type ZodAnyObject = z.ZodObject<z.ZodRawShape>;
type ZodAnyField = z.ZodTypeAny;

export function extractParamsFromSchema(schema: ZodAnyObject): JSDocParam[] {
	const params: JSDocParam[] = [];

	const shape = schema.shape;

	for (const [fieldName, fieldSchema] of Object.entries(shape)) {
		const zodField = fieldSchema as ZodAnyField;

		let description = "";
		// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
		const def = (zodField as any)._def;
		if (zodField.description) {
			description = zodField.description;
		} else if (def?.description) {
			description = def.description;
		}

		const isOptional = isZodFieldOptional(zodField);

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

function isZodFieldOptional(field: ZodAnyField): boolean {
	// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
	const def = (field as any)._def;

	if (def?.typeName === "ZodOptional") {
		return true;
	}

	if (def?.typeName === "ZodNullable") {
		return true;
	}

	if (def?.innerType) {
		return isZodFieldOptional(def.innerType);
	}

	if (def?.defaultValue !== undefined) {
		return true;
	}

	return false;
}

export function filterSchemaParams(
	schema: ZodAnyObject,
	includeFields: string[],
): JSDocParam[] {
	const allParams = extractParamsFromSchema(schema);
	return allParams.filter((param) => includeFields.includes(param.name));
}
