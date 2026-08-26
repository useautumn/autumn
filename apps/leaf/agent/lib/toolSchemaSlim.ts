import type {
	JsonSchemaObject,
	JsonValue,
} from "../../src/internal/autumnMcp/rpcClient.js";

const DESCRIPTION_DEPTH_MAX = 5;

const isInternal = (value: JsonValue) =>
	Boolean(value) &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	((value as JsonSchemaObject).internal === true ||
		(value as JsonSchemaObject)["x-internal"] === true);

const slimValue = (value: JsonValue, depth: number): JsonValue => {
	if (Array.isArray(value)) {
		return value.map((entry) => slimValue(entry, depth));
	}
	if (!value || typeof value !== "object") return value;
	return slimToolSchema(value, depth);
};

/** Drops `internal: true` properties and any `required` entry naming one — a
 * required-but-absent property is an unsatisfiable schema. */
const slimProperties = (properties: JsonValue, depth: number) => {
	if (
		!properties ||
		typeof properties !== "object" ||
		Array.isArray(properties)
	) {
		return {
			properties: slimValue(properties, depth),
			removed: [] as string[],
		};
	}
	const kept: JsonSchemaObject = {};
	const removed: string[] = [];
	for (const [name, schema] of Object.entries(properties)) {
		if (isInternal(schema)) {
			removed.push(name);
			continue;
		}
		kept[name] = slimValue(schema, depth);
	}
	return { properties: kept, removed };
};

/** Schema descriptions are ~half the tool-definition bytes the model
 * reprocesses every turn; below the request's own fields they add tokens,
 * not accuracy — the billing skill documents the deep shapes. Internal fields
 * are dropped outright: the model must never set them. Model-facing only; the
 * MCP wire is untouched. */
export const slimToolSchema = (
	value: JsonSchemaObject,
	depth = 0,
): JsonSchemaObject => {
	const slimmed: JsonSchemaObject = {};
	let removedProperties: string[] = [];
	for (const [key, entry] of Object.entries(value)) {
		if (key === "examples" || key === "title") continue;
		if (key === "internal" || key === "x-internal") continue;
		if (key === "description") {
			if (depth <= DESCRIPTION_DEPTH_MAX) slimmed[key] = entry;
			continue;
		}
		if (key === "properties") {
			const { properties, removed } = slimProperties(entry, depth + 1);
			removedProperties = removed;
			slimmed[key] = properties;
			continue;
		}
		slimmed[key] = slimValue(entry, depth + 1);
	}
	const required = slimmed.required;
	if (removedProperties.length && Array.isArray(required)) {
		slimmed.required = required.filter(
			(name) => !removedProperties.includes(name as string),
		);
	}
	return slimmed;
};
