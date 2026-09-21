import {
	JSON_SCHEMA_INPUT_REGISTRY,
	JSON_SCHEMA_OUTPUT_REGISTRY,
} from "@orpc/zod/zod4";
import type { z } from "zod/v4";
import { globalRegistry } from "zod/v4/core";

/**
 * Recursively walks a Zod schema and registers any schemas marked with
 * `.meta({ internal: true })` in both JSON_SCHEMA_INPUT_REGISTRY and
 * JSON_SCHEMA_OUTPUT_REGISTRY with `x-internal: true`. This allows
 * `removeInternalFields()` to strip them from the generated OpenAPI spec.
 *
 * Both registries are needed because ORPC uses the input registry for
 * request body schemas and the output registry for response schemas.
 */
export function registerInternalSchemas(
	schema: z.ZodType,
	{ mappingOnly = false }: { mappingOnly?: boolean } = {},
): void {
	const visited = new WeakSet<z.ZodType>();
	walkSchema(schema, visited, mappingOnly);
}

function walkSchema(
	schema: z.ZodType,
	visited: WeakSet<z.ZodType>,
	mappingOnly: boolean,
): void {
	if (visited.has(schema)) return;
	visited.add(schema);

	// Check if this schema has internal: true in its metadata
	const meta = globalRegistry.get(schema);
	const extensions = Object.fromEntries(
		Object.entries(meta ?? {}).filter(([key]) => key.startsWith("x-atmn-")),
	);
	if (!mappingOnly && meta?.internal === true) extensions["x-internal"] = true;
	if (Object.keys(extensions).length > 0) {
		const standardMetadata = Object.keys(extensions).some((key) =>
			key.startsWith("x-atmn-"),
		)
			? {
					...(meta?.title !== undefined ? { title: meta.title } : {}),
					...(meta?.description !== undefined
						? { description: meta.description }
						: {}),
					...(Array.isArray(meta?.examples) ? { examples: meta.examples } : {}),
				}
			: {};
		JSON_SCHEMA_INPUT_REGISTRY.add(schema, {
			...standardMetadata,
			...JSON_SCHEMA_INPUT_REGISTRY.get(schema),
			...extensions,
		});
		JSON_SCHEMA_OUTPUT_REGISTRY.add(schema, {
			...standardMetadata,
			...JSON_SCHEMA_OUTPUT_REGISTRY.get(schema),
			...extensions,
		});
	}

	// Get the internal Zod definition to traverse nested schemas
	// biome-ignore lint/suspicious/noExplicitAny: accessing Zod internals
	const def = (schema as any)._zod?.def ?? (schema as any)._def;
	if (!def) return;

	// Handle different Zod schema types
	switch (def.type ?? def.typeName) {
		case "object":
		case "ZodObject": {
			const shape = def.shape;
			if (shape && typeof shape === "object") {
				for (const fieldSchema of Object.values(shape)) {
					if (isZodType(fieldSchema)) {
						walkSchema(fieldSchema, visited, mappingOnly);
					}
				}
			}
			break;
		}

		case "array":
		case "ZodArray": {
			const element = def.element ?? def.type;
			if (isZodType(element)) {
				walkSchema(element, visited, mappingOnly);
			}
			break;
		}

		case "optional":
		case "ZodOptional":
		case "nullable":
		case "ZodNullable":
		case "readonly":
		case "ZodReadonly": {
			const innerType = def.innerType ?? def.unwrapped;
			if (isZodType(innerType)) {
				walkSchema(innerType, visited, mappingOnly);
			}
			break;
		}

		case "union":
		case "ZodUnion":
		case "discriminatedUnion":
		case "ZodDiscriminatedUnion": {
			const options = def.options;
			if (Array.isArray(options)) {
				for (const option of options) {
					if (isZodType(option)) {
						walkSchema(option, visited, mappingOnly);
					}
				}
			}
			break;
		}

		case "intersection":
		case "ZodIntersection": {
			if (isZodType(def.left)) walkSchema(def.left, visited, mappingOnly);
			if (isZodType(def.right)) walkSchema(def.right, visited, mappingOnly);
			break;
		}

		case "tuple":
		case "ZodTuple": {
			const items = def.items;
			if (Array.isArray(items)) {
				for (const item of items) {
					if (isZodType(item)) {
						walkSchema(item, visited, mappingOnly);
					}
				}
			}
			if (isZodType(def.rest)) {
				walkSchema(def.rest, visited, mappingOnly);
			}
			break;
		}

		case "record":
		case "ZodRecord": {
			if (isZodType(def.keyType)) walkSchema(def.keyType, visited, mappingOnly);
			if (isZodType(def.valueType))
				walkSchema(def.valueType, visited, mappingOnly);
			break;
		}

		case "map":
		case "ZodMap": {
			if (isZodType(def.keyType)) walkSchema(def.keyType, visited, mappingOnly);
			if (isZodType(def.valueType))
				walkSchema(def.valueType, visited, mappingOnly);
			break;
		}

		case "set":
		case "ZodSet": {
			if (isZodType(def.valueType))
				walkSchema(def.valueType, visited, mappingOnly);
			break;
		}

		case "lazy":
		case "ZodLazy": {
			// For lazy schemas, we need to get the actual schema
			const getter = def.getter;
			if (typeof getter === "function") {
				try {
					const lazySchema = getter();
					if (isZodType(lazySchema)) {
						walkSchema(lazySchema, visited, mappingOnly);
					}
				} catch {
					// Ignore errors from lazy evaluation
				}
			}
			break;
		}

		case "effects":
		case "ZodEffects":
		case "ZodPipeline": {
			const innerSchema = def.schema ?? def.in;
			if (isZodType(innerSchema)) {
				walkSchema(innerSchema, visited, mappingOnly);
			}
			break;
		}

		case "default":
		case "ZodDefault":
		case "catch":
		case "ZodCatch": {
			const innerType = def.innerType;
			if (isZodType(innerType)) {
				walkSchema(innerType, visited, mappingOnly);
			}
			break;
		}

		case "branded":
		case "ZodBranded": {
			const brandedType = def.type;
			if (isZodType(brandedType)) {
				walkSchema(brandedType, visited, mappingOnly);
			}
			break;
		}

		case "promise":
		case "ZodPromise": {
			const promiseType = def.type;
			if (isZodType(promiseType)) {
				walkSchema(promiseType, visited, mappingOnly);
			}
			break;
		}
	}
}

function isZodType(value: unknown): value is z.ZodType {
	if (!value || typeof value !== "object") return false;
	// Check for Zod v4 structure
	// biome-ignore lint/suspicious/noExplicitAny: checking Zod internals
	const v = value as any;
	return (
		(v._zod !== undefined && typeof v._zod === "object") ||
		(v._def !== undefined && typeof v._def === "object")
	);
}
