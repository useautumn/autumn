import { readFileSync } from "node:fs";
import yaml from "yaml";

export interface SchemaField {
	name: string;
	type: string;
	description?: string;
	required: boolean;
	children?: SchemaField[];
	enumValues?: string[];
}

export interface ParsedOperation {
	operationId: string;
	tag: string;
	method: string;
	path: string;
	summary?: string;
	description?: string;
	requestBody?: SchemaField[];
	responses?: {
		[statusCode: string]: SchemaField[];
	};
	/** Raw response schema for generating sample JSON */
	responseSchemas?: {
		[statusCode: string]: Record<string, unknown>;
	};
	/** Response examples extracted from the OpenAPI spec (already in snake_case) */
	responseExamples?: {
		[statusCode: string]: unknown;
	};
	/** Reference to all schemas for sample JSON generation */
	allSchemas?: Record<string, unknown>;
}

interface OpenApiDocument {
	components?: {
		schemas?: Record<string, unknown>;
	};
	paths?: Record<string, Record<string, unknown>>;
}

/**
 * Parse an OpenAPI YAML file and extract operation details.
 */
export function parseOpenApi({
	openApiPath,
}: {
	openApiPath: string;
}): ParsedOperation[] {
	const content = readFileSync(openApiPath, "utf-8");
	const doc = yaml.parse(content) as OpenApiDocument;

	const operations: ParsedOperation[] = [];
	const schemas = doc.components?.schemas ?? {};

	for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
		for (const [method, operationObj] of Object.entries(pathItem)) {
			if (method === "parameters" || method === "$ref") continue;

			const operation = operationObj as Record<string, unknown>;
			const operationId = operation.operationId as string | undefined;
			const tags = operation.tags as string[] | undefined;
			const tag = tags?.[0] ?? "core";

			if (!operationId) continue;

			const parsed: ParsedOperation = {
				operationId,
				tag,
				method: method.toUpperCase(),
				path,
				summary: operation.summary as string | undefined,
				description: operation.description as string | undefined,
			};

			// Parse request body
			const requestBody = operation.requestBody as
				| Record<string, unknown>
				| undefined;
			if (requestBody) {
				const content = requestBody.content as
					| Record<string, unknown>
					| undefined;
				const jsonContent = content?.["application/json"] as
					| Record<string, unknown>
					| undefined;
				const schema = jsonContent?.schema as
					| Record<string, unknown>
					| undefined;

				if (schema) {
					parsed.requestBody = parseSchema({
						schema,
						schemas,
						requiredFields: (schema.required as string[]) ?? [],
					});
				}
			}

			// Parse responses
			const responses = operation.responses as
				| Record<string, unknown>
				| undefined;
			if (responses) {
				parsed.responses = {};
				parsed.responseSchemas = {};
				parsed.responseExamples = {};

				for (const [statusCode, responseObj] of Object.entries(responses)) {
					const response = responseObj as Record<string, unknown>;
					const content = response.content as
						| Record<string, unknown>
						| undefined;
					const jsonContent = content?.["application/json"] as
						| Record<string, unknown>
						| undefined;
					const schema = jsonContent?.schema as
						| Record<string, unknown>
						| undefined;

					if (schema) {
						parsed.responses[statusCode] = parseSchema({
							schema,
							schemas,
							requiredFields: (schema.required as string[]) ?? [],
						});
						// Store raw schema for sample JSON generation
						parsed.responseSchemas[statusCode] = schema;
					}

					// Extract response example (could be at content level or schema level)
					const examples = jsonContent?.examples as unknown[] | undefined;
					const example =
						jsonContent?.example ??
						(Array.isArray(examples) ? examples[0] : undefined) ??
						resolveSchemaExample({ schema: schema ?? {}, schemas });
					if (example) {
						parsed.responseExamples[statusCode] = example;
					}
				}
			}

			// Store reference to all schemas for sample JSON generation
			parsed.allSchemas = schemas;

			operations.push(parsed);
		}
	}

	return operations;
}

/**
 * Resolves an example from a schema, following $ref if needed.
 */
function resolveSchemaExample({
	schema,
	schemas,
}: {
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
}): unknown {
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
			return resolveSchemaExample({ schema: refSchema, schemas });
		}
	}

	return undefined;
}

/**
 * Parse a schema and return a list of fields.
 */
function parseSchema({
	schema,
	schemas,
	requiredFields,
	visited = new Set<string>(),
}: {
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
	requiredFields: string[];
	visited?: Set<string>;
}): SchemaField[] {
	// Handle $ref
	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");

		// Prevent infinite recursion
		if (visited.has(refName)) {
			return [];
		}
		visited.add(refName);

		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema) {
			return parseSchema({
				schema: refSchema,
				schemas,
				requiredFields: (refSchema.required as string[]) ?? [],
				visited,
			});
		}
		return [];
	}

	// Handle anyOf/oneOf (common for nullable types)
	if (schema.anyOf || schema.oneOf) {
		const variants = (schema.anyOf ?? schema.oneOf) as Record<
			string,
			unknown
		>[];
		// Find the non-null variant
		const nonNullVariant = variants.find(
			(v) => v.type !== "null" && !v.$ref?.toString().includes("null"),
		);
		if (nonNullVariant) {
			return parseSchema({
				schema: nonNullVariant,
				schemas,
				requiredFields,
				visited,
			});
		}
		return [];
	}

	// Handle object type
	if (schema.type === "object") {
		return parseObjectFields({
			schema,
			schemas,
			requiredFields,
			visited,
		});
	}

	// Handle array type - return the items as a single field
	if (schema.type === "array" && schema.items) {
		const items = schema.items as Record<string, unknown>;
		const itemFields = parseSchema({
			schema: items,
			schemas,
			requiredFields: (items.required as string[]) ?? [],
			visited,
		});

		// Return array items as children of a virtual "items" field
		if (itemFields.length > 0) {
			return [
				{
					name: "items",
					type: "object",
					description: "Array item",
					required: false,
					children: itemFields,
				},
			];
		}
	}

	return [];
}

/**
 * Parse a single field from a schema property.
 */
function parseField({
	name,
	schema,
	schemas,
	required,
	visited,
}: {
	name: string;
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
	required: boolean;
	visited: Set<string>;
}): SchemaField | null {
	let resolvedName = name;
	let type = resolveType(schema, schemas);
	let description = schema.description as string | undefined;
	let children: SchemaField[] | undefined;
	let enumValues: string[] | undefined;

	// Handle $ref
	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");

		if (visited.has(refName)) {
			return { name, type: refName, description, required };
		}
		visited.add(refName);

		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema) {
			type = resolveType(refSchema, schemas);
			description =
				description ?? (refSchema.description as string | undefined);

			// Check for enum
			if (refSchema.enum) {
				enumValues = refSchema.enum as string[];
			}

			// Check for nested object
			if (refSchema.type === "object" && refSchema.properties) {
				children = parseSchema({
					schema: refSchema,
					schemas,
					requiredFields: (refSchema.required as string[]) ?? [],
					visited,
				});
			}
		}
	}

	// Handle anyOf/oneOf (nullable types)
	if (schema.anyOf || schema.oneOf) {
		const variants = (schema.anyOf ?? schema.oneOf) as Record<
			string,
			unknown
		>[];
		const hasNull = variants.some((v) => v.type === "null");
		const nonNullVariant = variants.find((v) => v.type !== "null");

		if (nonNullVariant) {
			const innerField = parseField({
				name,
				schema: nonNullVariant,
				schemas,
				required,
				visited,
			});

			if (innerField) {
				// Append "| null" if nullable
				if (hasNull) {
					innerField.type = `${innerField.type} | null`;
				}
				// Preserve description from parent schema if inner doesn't have one
				if (!innerField.description && description) {
					innerField.description = description;
				}
				return innerField;
			}
		}

		return {
			name,
			type: hasNull ? "any | null" : "any",
			description,
			required,
		};
	}

	// Handle enum
	if (schema.enum) {
		enumValues = schema.enum as string[];
	}

	// Handle nested object
	if (schema.type === "object") {
		children = parseObjectFields({
			schema,
			schemas,
			requiredFields: (schema.required as string[]) ?? [],
			visited,
		});

		// Flatten pure record objects from:
		// field -> {key} -> value fields
		// into:
		// field.{key} -> value fields
		const hasInlineProperties =
			!!schema.properties &&
			typeof schema.properties === "object" &&
			!Array.isArray(schema.properties) &&
			Object.keys(schema.properties as Record<string, unknown>).length > 0;
		if (
			!hasInlineProperties &&
			children.length === 1 &&
			children[0]?.name === "{key}"
		) {
			resolvedName = `${name}.{key}`;
			type = children[0].type;
			children = children[0].children;
		}
	}

	// Handle array
	if (schema.type === "array" && schema.items) {
		const items = schema.items as Record<string, unknown>;
		const itemType = resolveType(items, schemas);
		type = `${itemType}[]`;

		// Check if array items are an enum (directly or via $ref)
		if (items.enum) {
			enumValues = items.enum as string[];
		} else if (items.$ref) {
			const refPath = items.$ref as string;
			const refName = refPath.replace("#/components/schemas/", "");
			const refSchema = schemas[refName] as Record<string, unknown> | undefined;

			if (refSchema?.enum) {
				// Array items reference an enum schema
				enumValues = refSchema.enum as string[];
			} else if (
				refSchema &&
				refSchema.type === "object" &&
				refSchema.properties
			) {
				// Array items reference an object schema
				children = parseSchema({
					schema: refSchema,
					schemas,
					requiredFields: (refSchema.required as string[]) ?? [],
					visited: new Set(visited),
				});
			}
		}

		children = getArrayItemChildren({
			items,
			schemas,
			visited,
		});
	}

	return {
		name: resolvedName,
		type,
		description,
		required,
		children,
		enumValues,
	};
}

function parseObjectFields({
	schema,
	schemas,
	requiredFields,
	visited,
}: {
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
	requiredFields: string[];
	visited: Set<string>;
}): SchemaField[] {
	const fields: SchemaField[] = [];
	const properties = schema.properties as Record<string, unknown> | undefined;

	if (properties) {
		for (const [propName, propSchema] of Object.entries(properties)) {
			const prop = propSchema as Record<string, unknown>;
			const field = parseField({
				name: propName,
				schema: prop,
				schemas,
				required: requiredFields.includes(propName),
				visited: new Set(visited),
			});
			if (field) {
				fields.push(field);
			}
		}
	}

	const additionalProperties = schema.additionalProperties;
	const recordValueSchema = getRecordValueSchema({
		additionalProperties,
	});
	if (recordValueSchema) {
		const keyField = parseField({
			name: "{key}",
			schema: recordValueSchema,
			schemas,
			required: false,
			visited: new Set(visited),
		});
		if (keyField) {
			fields.push(keyField);
		}
	}

	return fields;
}

function getRecordValueSchema({
	additionalProperties,
}: {
	additionalProperties: unknown;
}): Record<string, unknown> | null {
	if (
		!additionalProperties ||
		typeof additionalProperties !== "object" ||
		Array.isArray(additionalProperties)
	) {
		return null;
	}

	const recordValueSchema = additionalProperties as Record<string, unknown>;
	if (Object.keys(recordValueSchema).length === 0) {
		return null;
	}

	return recordValueSchema;
}

function getArrayItemChildren({
	items,
	schemas,
	visited,
}: {
	items: Record<string, unknown>;
	schemas: Record<string, unknown>;
	visited: Set<string>;
}): SchemaField[] | undefined {
	// Direct object items
	if (items.type === "object") {
		const objectChildren = parseObjectFields({
			schema: items,
			schemas,
			requiredFields: (items.required as string[]) ?? [],
			visited: new Set(visited),
		});
		if (objectChildren.length > 0) {
			return objectChildren;
		}
	}

	// Referenced object items
	if (items.$ref) {
		const refPath = items.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");
		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema?.type === "object") {
			const objectChildren = parseObjectFields({
				schema: refSchema,
				schemas,
				requiredFields: (refSchema.required as string[]) ?? [],
				visited: new Set(visited),
			});
			if (objectChildren.length > 0) {
				return objectChildren;
			}
		}
	}

	// Union object items (e.g. anyOf reward_id | promotion_code)
	const variantsRaw = items.anyOf ?? items.oneOf;
	if (Array.isArray(variantsRaw) && variantsRaw.length > 0) {
		const mergedByName = new Map<string, SchemaField>();

		for (const variant of variantsRaw) {
			if (typeof variant !== "object" || variant === null) {
				continue;
			}
			const variantSchema = variant as Record<string, unknown>;
			const variantType = resolveType(variantSchema, schemas);
			if (variantType !== "object") {
				continue;
			}

			const variantFields = parseSchema({
				schema: variantSchema,
				schemas,
				requiredFields: (variantSchema.required as string[]) ?? [],
				visited: new Set(visited),
			});

			for (const variantField of variantFields) {
				const existing = mergedByName.get(variantField.name);
				if (!existing) {
					mergedByName.set(variantField.name, {
						...variantField,
						required: false,
					});
					continue;
				}

				const mergedType = mergeFieldTypes({
					left: existing.type,
					right: variantField.type,
				});
				mergedByName.set(variantField.name, {
					...existing,
					type: mergedType,
					description: existing.description ?? variantField.description,
					children: existing.children ?? variantField.children,
					enumValues: existing.enumValues ?? variantField.enumValues,
					required: false,
				});
			}
		}

		const mergedFields = [...mergedByName.values()];
		if (mergedFields.length > 0) {
			return mergedFields;
		}
	}

	return undefined;
}

function mergeFieldTypes({
	left,
	right,
}: {
	left: string;
	right: string;
}): string {
	if (left === right) {
		return left;
	}

	const typeSet = new Set<string>();
	for (const part of [...left.split("|"), ...right.split("|")]) {
		const trimmed = part.trim();
		if (trimmed.length > 0) {
			typeSet.add(trimmed);
		}
	}

	return [...typeSet].join(" | ");
}

/**
 * Resolve the type string for a schema.
 */
function resolveType(
	schema: Record<string, unknown>,
	schemas: Record<string, unknown>,
): string {
	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");
		const refSchema = schemas[refName] as Record<string, unknown> | undefined;

		if (refSchema) {
			// If it's an enum, return "enum"
			if (refSchema.enum) {
				return "enum";
			}
			// Otherwise return the underlying type
			return resolveType(refSchema, schemas);
		}
		return refName;
	}

	if (schema.anyOf || schema.oneOf) {
		const variants = (schema.anyOf ?? schema.oneOf) as Record<
			string,
			unknown
		>[];
		const nonNullVariants = variants.filter((v) => v.type !== "null");

		if (nonNullVariants.length === 0) {
			return "any";
		}

		if (nonNullVariants.length === 1) {
			return resolveType(nonNullVariants[0], schemas);
		}

		const types = nonNullVariants.map((v) => resolveType(v, schemas));
		return types.join(" | ");
	}

	if (schema.type === "array") {
		const items = schema.items as Record<string, unknown> | undefined;
		if (items) {
			return `${resolveType(items, schemas)}[]`;
		}
		return "array";
	}

	return (schema.type as string) ?? "any";
}

/**
 * Generate a sample JSON object from a schema for documentation examples.
 * Returns a simplified sample that shows the structure without excessive nesting.
 */
export function generateSampleJson({
	schema,
	schemas,
	visited = new Set<string>(),
	depth = 0,
}: {
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
	visited?: Set<string>;
	depth?: number;
}): unknown {
	// Prevent infinite recursion and excessive depth
	// For deep nesting, return placeholder to keep output manageable
	if (depth > 3) {
		return "...";
	}

	// Check for examples defined on the schema (use first example if available)
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

	// Handle $ref
	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");

		if (visited.has(refName)) {
			return "..."; // Circular reference placeholder
		}
		const newVisited = new Set(visited);
		newVisited.add(refName);

		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema) {
			return generateSampleJson({
				schema: refSchema,
				schemas,
				visited: newVisited,
				depth: depth + 1,
			});
		}
		return null;
	}

	// Handle anyOf/oneOf (pick non-null variant)
	if (schema.anyOf || schema.oneOf) {
		const variants = (schema.anyOf ?? schema.oneOf) as Record<
			string,
			unknown
		>[];
		const nonNullVariant = variants.find(
			(v) => v.type !== "null" && !("const" in v && v.const === null),
		);
		if (nonNullVariant) {
			return generateSampleJson({
				schema: nonNullVariant,
				schemas,
				visited,
				depth,
			});
		}
		return null;
	}

	// Handle enum - return first value
	if (schema.enum) {
		const enumValues = schema.enum as unknown[];
		return enumValues[0] ?? null;
	}

	// Handle const
	if ("const" in schema) {
		return schema.const;
	}

	// Handle object type
	if (schema.type === "object") {
		const properties = schema.properties as Record<string, unknown> | undefined;
		if (!properties) {
			return {};
		}

		const result: Record<string, unknown> = {};
		for (const [propName, propSchema] of Object.entries(properties)) {
			result[propName] = generateSampleJson({
				schema: propSchema as Record<string, unknown>,
				schemas,
				visited: new Set(visited), // Fresh set for each property to avoid false positives
				depth: depth + 1,
			});
		}
		return result;
	}

	// Handle array type
	if (schema.type === "array") {
		const items = schema.items as Record<string, unknown> | undefined;
		if (items) {
			return [
				generateSampleJson({
					schema: items,
					schemas,
					visited: new Set(visited),
					depth: depth + 1,
				}),
			];
		}
		return [];
	}

	// Handle primitive types with example values
	switch (schema.type) {
		case "string":
			return "<string>";
		case "number":
		case "integer":
			return 123;
		case "boolean":
			return true;
		default:
			return null;
	}
}
