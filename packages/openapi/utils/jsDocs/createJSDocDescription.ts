import { z } from "zod/v4";

export interface JSDocParam {
	name: string;
	description: string;
	optional?: boolean;
}

interface JSDocExample {
	description?: string;
	values: Record<string, unknown>;
}

interface JSDocLink {
	url: string;
	title: string;
}

interface JSDocOptions {
	description: string;
	whenToUse?: string;
	// Provide the request schemas
	body?: z.ZodObject<z.ZodRawShape>;
	query?: z.ZodObject<z.ZodRawShape>;
	path?: z.ZodObject<z.ZodRawShape>;
	docs?: JSDocLink[];
	examples?: JSDocExample[];
	methodName?: string;
	returns?: string;
	throws?: Array<{ type: string; description: string }>;
}

/**
 * Converts snake_case to camelCase.
 * Speakeasy generates TypeScript SDK with camelCase property names.
 */
function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Formats an object as a TypeScript-style object literal.
 * Keeps formatting compact to avoid YAML serialization issues.
 */
function formatExampleObject(obj: Record<string, unknown>): string {
	const entries = Object.entries(obj);
	if (entries.length === 0) {
		return "{}";
	}

	// For small objects (≤3 properties), use single line
	if (entries.length <= 3) {
		const props = entries
			.map(([key, value]) => `${snakeToCamel(key)}: ${JSON.stringify(value)}`)
			.join(", ");
		return `{ ${props} }`;
	}

	// For larger objects, use multi-line but keep opening brace with first prop
	const lines = entries.map(
		([key, value]) => `  ${snakeToCamel(key)}: ${JSON.stringify(value)},`,
	);
	return `{\n${lines.join("\n")}\n}`;
}

/**
 * Unwraps optional/nullable wrappers to get the underlying type's description.
 * In Zod v4, .partial() wraps fields in optional, losing the description on the wrapper.
 */
// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
function getDescriptionFromField(zodField: any): string | undefined {
	// Direct description (works for non-wrapped types)
	if (zodField.description) {
		return zodField.description;
	}

	// Check innerType for optional/nullable wrappers
	const def = zodField._def;
	if (def?.innerType?.description) {
		return def.innerType.description;
	}

	// Recurse into innerType if it's also wrapped (e.g., optional(nullable(...)))
	if (def?.innerType?._def?.innerType?.description) {
		return def.innerType._def.innerType.description;
	}

	return undefined;
}

/**
 * Checks if a Zod field is marked as internal via .meta({ internal: true }).
 * Internal fields should be excluded from public documentation.
 * In Zod v4, meta is stored in z.globalRegistry.
 */
// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
function isInternalField(zodField: any): boolean {
	// Check direct meta from global registry
	const meta = z.globalRegistry.get(zodField);
	if (meta?.internal === true) {
		return true;
	}

	// Check innerType for wrapped fields (optional/nullable)
	const def = zodField._def;
	if (def?.innerType) {
		const innerMeta = z.globalRegistry.get(def.innerType);
		if (innerMeta?.internal === true) {
			return true;
		}

		// Check deeper nesting (e.g., optional(nullable(...)))
		if (def.innerType._def?.innerType) {
			const deeperMeta = z.globalRegistry.get(def.innerType._def.innerType);
			if (deeperMeta?.internal === true) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Checks if a Zod field is optional or nullable.
 */
// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
function isOptionalField(zodField: any): boolean {
	const def = zodField._def;
	const typeName = def?.type || def?.typeName;

	return (
		typeName === "optional" ||
		typeName === "nullable" ||
		typeName === "ZodOptional" ||
		typeName === "ZodNullable" ||
		def?.defaultValue !== undefined
	);
}

/**
 * Extracts parameter documentation from a Zod object schema.
 * Converts snake_case field names to camelCase for TypeScript SDK compatibility.
 * Skips fields marked with .meta({ internal: true }).
 */
function extractParamsFromSchema(
	schema: z.ZodObject<z.ZodRawShape>,
): JSDocParam[] {
	const params: JSDocParam[] = [];
	const shape = schema.shape;

	for (const [fieldName, fieldSchema] of Object.entries(shape)) {
		// Skip internal fields
		if (isInternalField(fieldSchema)) {
			continue;
		}

		const description = getDescriptionFromField(fieldSchema);

		if (description) {
			// Convert snake_case to camelCase for TypeScript SDK
			const camelFieldName = snakeToCamel(fieldName);
			params.push({
				name: camelFieldName,
				description,
				optional: isOptionalField(fieldSchema),
			});
		}
	}

	return params;
}

/**
 * Generates a formatted JSDoc description string for OpenAPI specs
 * that Speakeasy will convert to SDK documentation.
 */
export function createJSDocDescription(options: JSDocOptions): string {
	const parts: string[] = [];

	// Main description
	parts.push(options.description);

	// When to use section
	if (options.whenToUse) {
		parts.push("");
		parts.push(options.whenToUse);
	}

	// Examples (show before params)
	if (options.examples && options.examples.length > 0) {
		const methodName = options.methodName || "method";

		for (const example of options.examples) {
			parts.push("");
			parts.push("@example");
			parts.push("```typescript");

			// Add example description as a comment if provided
			if (example.description) {
				parts.push(`// ${example.description}`);
			}

			// Format the example object with proper TypeScript formatting
			const exampleStr = formatExampleObject(
				example.values as Record<string, unknown>,
			);
			parts.push(`const response = await client.${methodName}(${exampleStr});`);
			parts.push("```");
		}
	}

	// Parameters - no prefix needed, params go directly into function call
	const allParams: JSDocParam[] = [];

	// Extract path params
	if (options.path) {
		allParams.push(...extractParamsFromSchema(options.path));
	}

	// Extract body params
	if (options.body) {
		allParams.push(...extractParamsFromSchema(options.body));
	}

	// Extract query params
	if (options.query) {
		allParams.push(...extractParamsFromSchema(options.query));
	}

	if (allParams.length > 0) {
		parts.push("");
		for (const param of allParams) {
			const optional = param.optional ? " (optional)" : "";
			parts.push(`@param ${param.name} - ${param.description}${optional}`);
		}
	}

	// Returns
	if (options.returns) {
		parts.push("");
		parts.push(`@returns ${options.returns}`);
	}

	// Throws
	if (options.throws && options.throws.length > 0) {
		parts.push("");
		for (const error of options.throws) {
			parts.push(`@throws {${error.type}} ${error.description}`);
		}
	}

	// Documentation links
	if (options.docs && options.docs.length > 0) {
		parts.push("");
		for (const doc of options.docs) {
			parts.push(`@see {@link ${doc.url} ${doc.title}}`);
		}
	}

	return parts.join("\n");
}
