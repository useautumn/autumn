import type { z } from "zod/v4";

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
 * Generates a formatted JSDoc description string for OpenAPI specs
 * that Stainless will convert to SDK documentation.
 */
export function createJSDocDescription(options: JSDocOptions): string {
	const extractParamsFromSchema = (
		schema: z.ZodObject<z.ZodRawShape>,
		prefix?: string,
	): JSDocParam[] => {
		const params: JSDocParam[] = [];
		const shape = schema.shape;

		for (const [fieldName, fieldSchema] of Object.entries(shape)) {
			// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internal properties
			const zodField = fieldSchema as any;
			const def = zodField._def;

			let description = "";
			if (zodField.description) {
				description = zodField.description;
			} else if (def?.description) {
				description = def.description;
			}

			if (description) {
				const paramName = prefix ? `${prefix}.${fieldName}` : fieldName;
				params.push({
					name: paramName,
					description,
					optional:
						def?.typeName === "ZodOptional" ||
						def?.typeName === "ZodNullable" ||
						def?.defaultValue !== undefined,
				});
			}
		}

		return params;
	};

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

			// Format the example object
			const exampleStr = JSON.stringify(example.values, null, 2)
				.split("\n")
				.map((line, idx) => (idx === 0 ? line : `  ${line}`))
				.join("\n");

			parts.push(`const response = await client.${methodName}(${exampleStr});`);
			parts.push("```");
		}
	}

	// Parameters - determine prefix based on Stainless naming logic
	const allParams: JSDocParam[] = [];
	const hasBody = !!options.body;
	const hasQuery = !!options.query;
	const hasPath = !!options.path;

	// Path params always have no prefix
	if (hasPath && options.path) {
		allParams.push(...extractParamsFromSchema(options.path));
	}

	// Determine prefix for body/query based on Stainless logic:
	// - Only body → "body"
	// - Only query → "query"
	// - Query + Body (mixed) → "params"
	// - Path + Body → "params"
	let paramPrefix: string | undefined;

	if (hasBody && hasQuery) {
		// Mixed query + body → Stainless uses "params"
		paramPrefix = "params";
	} else if (hasBody && hasPath) {
		// Path + body → Stainless uses "params" for body fields
		paramPrefix = "params";
	} else if (hasBody) {
		// Only body → Stainless uses "body"
		paramPrefix = "body";
	} else if (hasQuery) {
		// Only query → Stainless uses "query"
		paramPrefix = "query";
	}

	// Extract body params with appropriate prefix
	if (hasBody && options.body) {
		allParams.push(...extractParamsFromSchema(options.body, paramPrefix));
	}

	// Extract query params with appropriate prefix
	if (hasQuery && options.query) {
		allParams.push(...extractParamsFromSchema(options.query, paramPrefix));
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

/**
 * Shorthand helper for creating parameter definitions
 */
export function param(
	name: string,
	description: string,
	optional = false,
): JSDocParam {
	return { name, description, optional };
}

/**
 * Shorthand helper for creating example definitions
 */
export function example(options: {
	values: Record<string, unknown>;
	description?: string;
}): JSDocExample {
	return { values: options.values, description: options.description };
}

/**
 * Shorthand helper for creating documentation link definitions
 */
export function docLink(options: { url: string; title: string }): JSDocLink {
	return { url: options.url, title: options.title };
}
