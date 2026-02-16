import yaml from "yaml";

/**
 * Strips JSDoc tags from a description string.
 * Returns content up to the first @ tag (trimmed).
 */
function stripJsDocTags(description: string): string {
	// Find the first @ tag that starts a line (common JSDoc tags)
	const tagPatterns = [
		/@example\b/,
		/@param\b/,
		/@see\b/,
		/@returns?\b/,
		/@throws?\b/,
		/@deprecated\b/,
		/@since\b/,
		/@version\b/,
		/@author\b/,
		/@link\b/,
		/@type\b/,
		/@typedef\b/,
		/@property\b/,
		/@default\b/,
	];

	let cutIndex = description.length;

	for (const pattern of tagPatterns) {
		const match = description.match(pattern);
		if (match && match.index !== undefined && match.index < cutIndex) {
			cutIndex = match.index;
		}
	}

	return description.slice(0, cutIndex).trim();
}

/**
 * Transforms SDK code sample from Speakeasy format to autumn-js format.
 */
function transformCodeSample(source: string): string {
	// Replace import
	let result = source.replace(
		/import \{ Autumn \} from "@useautumn\/sdk";/g,
		"import { Autumn } from 'autumn-js'"
	);

	// Replace initialization with simpler version
	result = result.replace(
		/const autumn = new Autumn\(\{[\s\S]*?\}\);/g,
		"const autumn = new Autumn()"
	);

	// Remove async wrapper function - extract the inner content
	const asyncWrapperMatch = result.match(
		/async function run\(\) \{([\s\S]*?)\}\s*\n\s*run\(\);/
	);
	if (asyncWrapperMatch) {
		const innerContent = asyncWrapperMatch[1]
			.split("\n")
			.map((line) => {
				// Remove 2 spaces of indentation from the wrapper
				if (line.startsWith("  ")) {
					return line.slice(2);
				}
				return line;
			})
			.join("\n")
			.trim();
		result = result.replace(asyncWrapperMatch[0], innerContent);
	}

	// Remove console.log
	result = result.replace(/\s*console\.log\(result\);?/g, "");

	// Clean up extra blank lines
	result = result.replace(/\n{3,}/g, "\n\n").trim();

	return result;
}

/**
 * Recursively walks the OpenAPI document and applies transformations.
 */
function transformNode(node: unknown, schemas?: Record<string, unknown>): void {
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
				sampleRecord.source = transformCodeSample(sampleRecord.source as string);
			}
		}
	}

	// Copy schema examples to response content level for Mintlify
	if (schemas && record.content) {
		const content = record.content as Record<string, unknown>;
		const jsonContent = content["application/json"] as Record<string, unknown> | undefined;
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

/**
 * Resolves an example from a schema, following $ref if needed.
 */
function resolveSchemaExample(
	schema: Record<string, unknown>,
	schemas: Record<string, unknown>
): unknown {
	// Check for examples array
	if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
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
 * Transforms an OpenAPI YAML document for Mintlify consumption.
 * 
 * - Strips JSDoc tags from descriptions
 * - Transforms Speakeasy code samples to use autumn-js format
 * - Copies schema examples to response content level
 */
export function transformOpenApiForMintlify(yamlContent: string): string {
	const doc = yaml.parse(yamlContent) as Record<string, unknown>;
	const schemas = (doc.components as Record<string, unknown>)?.schemas as Record<string, unknown> | undefined;
	transformNode(doc, schemas);
	return yaml.stringify(doc);
}
