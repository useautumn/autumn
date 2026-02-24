import { stripJsDocTags } from "./stripJsDocTags.js";
import {
	transformPythonCodeSample,
	transformTypeScriptCodeSample,
} from "./transformCodeSamples.js";

/**
 * Resolves an example from a schema, following $ref if needed.
 */
export function resolveSchemaExample(
	schema: Record<string, unknown>,
	schemas: Record<string, unknown>,
): unknown {
	// Check for examples array
	if (
		schema.examples &&
		Array.isArray(schema.examples) &&
		schema.examples.length > 0
	) {
		return schema.examples[0];
	}

	// Check for single example
	if (schema.example !== undefined) {
		return schema.example;
	}

	// Follow $ref
	if (schema.$ref && typeof schema.$ref === "string") {
		const refName = schema.$ref.replace("#/components/schemas/", "");
		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema) {
			return resolveSchemaExample(refSchema, schemas);
		}
	}

	return undefined;
}

/**
 * Recursively walks the OpenAPI document and applies transformations.
 */
export function transformNode(
	node: unknown,
	schemas?: Record<string, unknown>,
): void {
	if (Array.isArray(node)) {
		for (const item of node) {
			transformNode(item, schemas);
		}
		return;
	}

	if (typeof node !== "object" || node === null) {
		return;
	}

	const record = node as Record<string, unknown>;

	// Transform descriptions to strip JSDoc tags
	if (typeof record.description === "string") {
		record.description = stripJsDocTags(record.description);
	}

	// Transform code samples
	if (Array.isArray(record["x-codeSamples"])) {
		for (const sample of record["x-codeSamples"]) {
			if (
				typeof sample === "object" &&
				sample !== null &&
				typeof (sample as Record<string, unknown>).source === "string"
			) {
				const sampleRecord = sample as Record<string, unknown>;
				const lang = sampleRecord.lang as string | undefined;
				const source = sampleRecord.source as string;

				if (lang === "python" || source.includes("from autumn_sdk import")) {
					sampleRecord.source = transformPythonCodeSample(source);
				} else {
					sampleRecord.source = transformTypeScriptCodeSample(source);
				}
			}
		}
	}

	// Copy schema examples to response content level for Mintlify
	if (schemas && record.content) {
		const content = record.content as Record<string, unknown>;
		const jsonContent = content["application/json"] as
			| Record<string, unknown>
			| undefined;
		if (jsonContent?.schema && !jsonContent.example && !jsonContent.examples) {
			const schema = jsonContent.schema as Record<string, unknown>;
			const example = resolveSchemaExample(schema, schemas);
			if (example) {
				jsonContent.example = example;
			}
		}
	}

	// Recurse into nested objects
	for (const value of Object.values(record)) {
		transformNode(value, schemas);
	}
}
