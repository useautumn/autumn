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
	body?: z.ZodObject<z.ZodRawShape>;
	query?: z.ZodObject<z.ZodRawShape>;
	path?: z.ZodObject<z.ZodRawShape>;
	docs?: JSDocLink[];
	examples?: JSDocExample[];
	methodName?: string;
	returns?: string;
	throws?: Array<{ type: string; description: string }>;
}

function snakeToCamel(str: string): string {
	return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function formatExampleObject(obj: Record<string, unknown>): string {
	const entries = Object.entries(obj);
	if (entries.length === 0) {
		return "{}";
	}

	if (entries.length <= 3) {
		const props = entries
			.map(([key, value]) => `${snakeToCamel(key)}: ${JSON.stringify(value)}`)
			.join(", ");
		return `{ ${props} }`;
	}

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
	if (zodField.description) {
		return zodField.description;
	}

	const def = zodField._def;
	if (def?.innerType?.description) {
		return def.innerType.description;
	}

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
	const meta = z.globalRegistry.get(zodField);
	if (meta?.internal === true) {
		return true;
	}

	const def = zodField._def;
	if (def?.innerType) {
		const innerMeta = z.globalRegistry.get(def.innerType);
		if (innerMeta?.internal === true) {
			return true;
		}

		if (def.innerType._def?.innerType) {
			const deeperMeta = z.globalRegistry.get(def.innerType._def.innerType);
			if (deeperMeta?.internal === true) {
				return true;
			}
		}
	}

	return false;
}

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

function extractParamsFromSchema(
	schema: z.ZodObject<z.ZodRawShape>,
): JSDocParam[] {
	const params: JSDocParam[] = [];
	const shape = schema.shape;

	for (const [fieldName, fieldSchema] of Object.entries(shape)) {
		if (isInternalField(fieldSchema)) {
			continue;
		}

		const description = getDescriptionFromField(fieldSchema);

		if (description) {
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

export function createJSDocDescription(options: JSDocOptions): string {
	const parts: string[] = [];

	parts.push(options.description);

	if (options.whenToUse) {
		parts.push("");
		parts.push(options.whenToUse);
	}

	if (options.examples && options.examples.length > 0) {
		const methodName = options.methodName || "method";

		for (const example of options.examples) {
			parts.push("");
			parts.push("@example");
			parts.push("```typescript");

			if (example.description) {
				parts.push(`// ${example.description}`);
			}

			const exampleStr = formatExampleObject(
				example.values as Record<string, unknown>,
			);
			parts.push(`const response = await client.${methodName}(${exampleStr});`);
			parts.push("```");
		}
	}

	const allParams: JSDocParam[] = [];

	if (options.path) {
		allParams.push(...extractParamsFromSchema(options.path));
	}

	if (options.body) {
		allParams.push(...extractParamsFromSchema(options.body));
	}

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

	if (options.returns) {
		parts.push("");
		parts.push(`@returns ${options.returns}`);
	}

	if (options.throws && options.throws.length > 0) {
		parts.push("");
		for (const error of options.throws) {
			parts.push(`@throws {${error.type}} ${error.description}`);
		}
	}

	if (options.docs && options.docs.length > 0) {
		parts.push("");
		for (const doc of options.docs) {
			parts.push(`@see {@link ${doc.url} ${doc.title}}`);
		}
	}

	return parts.join("\n");
}
