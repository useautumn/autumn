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
export function registerInternalSchemas(schema: z.ZodType): void {
	const visited = new WeakSet<z.ZodType>();
	walkSchema(schema, visited);
}

function walkSchema(schema: z.ZodType, visited: WeakSet<z.ZodType>): void {
	if (visited.has(schema)) return;
	visited.add(schema);

	// Check if this schema has internal: true in its metadata
	const meta = globalRegistry.get(schema);
	if (meta?.internal === true) {
		// Register with x-internal in BOTH registries so removeInternalFields() can find it
		// Input registry is used for request bodies, output registry for responses
		// biome-ignore lint/suspicious/noExplicitAny: TypeScript types are restrictive but runtime accepts arbitrary props
		JSON_SCHEMA_INPUT_REGISTRY.add(schema, { "x-internal": true } as any);
		// biome-ignore lint/suspicious/noExplicitAny: TypeScript types are restrictive but runtime accepts arbitrary props
		JSON_SCHEMA_OUTPUT_REGISTRY.add(schema, { "x-internal": true } as any);
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
						walkSchema(fieldSchema, visited);
					}
				}
			}
			break;
		}

		case "array":
		case "ZodArray": {
			const element = def.element ?? def.type;
			if (isZodType(element)) {
				walkSchema(element, visited);
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
				walkSchema(innerType, visited);
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
						walkSchema(option, visited);
					}
				}
			}
			break;
		}

		case "intersection":
		case "ZodIntersection": {
			if (isZodType(def.left)) walkSchema(def.left, visited);
			if (isZodType(def.right)) walkSchema(def.right, visited);
			break;
		}

		case "tuple":
		case "ZodTuple": {
			const items = def.items;
			if (Array.isArray(items)) {
				for (const item of items) {
					if (isZodType(item)) {
						walkSchema(item, visited);
					}
				}
			}
			if (isZodType(def.rest)) {
				walkSchema(def.rest, visited);
			}
			break;
		}

		case "record":
		case "ZodRecord": {
			if (isZodType(def.keyType)) walkSchema(def.keyType, visited);
			if (isZodType(def.valueType)) walkSchema(def.valueType, visited);
			break;
		}

		case "map":
		case "ZodMap": {
			if (isZodType(def.keyType)) walkSchema(def.keyType, visited);
			if (isZodType(def.valueType)) walkSchema(def.valueType, visited);
			break;
		}

		case "set":
		case "ZodSet": {
			if (isZodType(def.valueType)) walkSchema(def.valueType, visited);
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
						walkSchema(lazySchema, visited);
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
				walkSchema(innerSchema, visited);
			}
			break;
		}

		case "default":
		case "ZodDefault":
		case "catch":
		case "ZodCatch": {
			const innerType = def.innerType;
			if (isZodType(innerType)) {
				walkSchema(innerType, visited);
			}
			break;
		}

		case "branded":
		case "ZodBranded": {
			const brandedType = def.type;
			if (isZodType(brandedType)) {
				walkSchema(brandedType, visited);
			}
			break;
		}

		case "promise":
		case "ZodPromise": {
			const promiseType = def.type;
			if (isZodType(promiseType)) {
				walkSchema(promiseType, visited);
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
