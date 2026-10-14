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
	responseSchemas?: {
		[statusCode: string]: Record<string, unknown>;
	};
	responseExamples?: {
		[statusCode: string]: unknown;
	};
	allSchemas?: Record<string, unknown>;
}

export interface ParsedWebhook {
	eventType: string;
	operationId: string;
	group: string;
	summary?: string;
	description?: string;
	dataFields?: SchemaField[];
}

interface OpenApiDocument {
	components?: {
		schemas?: Record<string, unknown>;
	};
	paths?: Record<string, Record<string, unknown>>;
	webhooks?: Record<string, Record<string, unknown>>;
}

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
						parsed.responseSchemas[statusCode] = schema;
					}

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

			parsed.allSchemas = schemas;

			operations.push(parsed);
		}
	}

	return operations;
}

export function parseWebhooks({
	openApiPath,
	groupMap = {},
}: {
	openApiPath: string;
	groupMap?: Record<string, string>;
}): ParsedWebhook[] {
	const content = readFileSync(openApiPath, "utf-8");
	const doc = yaml.parse(content) as OpenApiDocument;

	const schemas = doc.components?.schemas ?? {};
	const webhooks: ParsedWebhook[] = [];

	for (const [eventType, webhookItem] of Object.entries(doc.webhooks ?? {})) {
		const postOp = webhookItem.post as Record<string, unknown> | undefined;
		if (!postOp) continue;

		const operationId = postOp.operationId as string | undefined;
		if (!operationId) continue;

		const parsed: ParsedWebhook = {
			eventType,
			operationId,
			group: groupMap[operationId] ?? "Webhooks",
			summary: postOp.summary as string | undefined,
			description: postOp.description as string | undefined,
		};

		const requestBody = postOp.requestBody as
			| Record<string, unknown>
			| undefined;
		const jsonContent = (
			requestBody?.content as Record<string, unknown> | undefined
		)?.["application/json"] as Record<string, unknown> | undefined;
		const bodySchema = jsonContent?.schema as
			| Record<string, unknown>
			| undefined;

		if (bodySchema) {
			const properties = bodySchema.properties as
				| Record<string, unknown>
				| undefined;
			const dataSchema = properties?.data as
				| Record<string, unknown>
				| undefined;

			if (dataSchema) {
				parsed.dataFields = parseSchema({
					schema: dataSchema,
					schemas,
					requiredFields: (dataSchema.required as string[]) ?? [],
				});
			}
		}

		webhooks.push(parsed);
	}

	return webhooks;
}

function resolveSchemaExample({
	schema,
	schemas,
}: {
	schema: Record<string, unknown>;
	schemas: Record<string, unknown>;
}): unknown {
	if (
		schema.examples &&
		Array.isArray(schema.examples) &&
		schema.examples.length > 0
	) {
		return schema.examples[0];
	}

	if (schema.example !== undefined) {
		return schema.example;
	}

	if (schema.$ref && typeof schema.$ref === "string") {
		const refName = schema.$ref.replace("#/components/schemas/", "");
		const refSchema = schemas[refName] as Record<string, unknown> | undefined;
		if (refSchema) {
			return resolveSchemaExample({ schema: refSchema, schemas });
		}
	}

	return undefined;
}

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
	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");

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

	if (schema.anyOf || schema.oneOf) {
		const variants = (schema.anyOf ?? schema.oneOf) as Record<
			string,
			unknown
		>[];
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

	if (schema.type === "object") {
		return parseObjectFields({
			schema,
			schemas,
			requiredFields,
			visited,
		});
	}

	if (schema.type === "array" && schema.items) {
		const items = schema.items as Record<string, unknown>;
		const itemFields = parseSchema({
			schema: items,
			schemas,
			requiredFields: (items.required as string[]) ?? [],
			visited,
		});

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

			if (refSchema.enum) {
				enumValues = refSchema.enum as string[];
			}

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
				if (hasNull) {
					innerField.type = `${innerField.type} | null`;
				}
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

	if (schema.enum) {
		enumValues = schema.enum as string[];
	}

	if (schema.type === "object") {
		children = parseObjectFields({
			schema,
			schemas,
			requiredFields: (schema.required as string[]) ?? [],
			visited,
		});

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

	if (schema.type === "array" && schema.items) {
		const items = schema.items as Record<string, unknown>;
		const itemType = resolveType(items, schemas);
		type = `${itemType}[]`;

		if (items.enum) {
			enumValues = items.enum as string[];
		} else if (items.$ref) {
			const refPath = items.$ref as string;
			const refName = refPath.replace("#/components/schemas/", "");
			const refSchema = schemas[refName] as Record<string, unknown> | undefined;

			if (refSchema?.enum) {
				enumValues = refSchema.enum as string[];
			} else if (
				refSchema &&
				refSchema.type === "object" &&
				refSchema.properties
			) {
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

function resolveType(
	schema: Record<string, unknown>,
	schemas: Record<string, unknown>,
): string {
	if (typeof schema.const === "boolean") return String(schema.const);

	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");
		const refSchema = schemas[refName] as Record<string, unknown> | undefined;

		if (refSchema) {
			if (refSchema.enum) {
				return "enum";
			}
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
	if (depth > 3) {
		return "...";
	}

	if (
		schema.examples &&
		Array.isArray(schema.examples) &&
		schema.examples.length > 0
	) {
		return schema.examples[0];
	}

	if (schema.example !== undefined) {
		return schema.example;
	}

	if (schema.$ref) {
		const refPath = schema.$ref as string;
		const refName = refPath.replace("#/components/schemas/", "");

		if (visited.has(refName)) {
			return "...";
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

	if (schema.enum) {
		const enumValues = schema.enum as unknown[];
		return enumValues[0] ?? null;
	}

	if ("const" in schema) {
		return schema.const;
	}

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
				visited: new Set(visited),
				depth: depth + 1,
			});
		}
		return result;
	}

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
