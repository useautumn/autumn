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

const slimProperties = (properties: JsonSchemaObject, depth: number) => {
	const kept: JsonSchemaObject = {};
	const dropped = new Set<string>();
	for (const [name, schema] of Object.entries(properties)) {
		if (isInternal(schema)) dropped.add(name);
		else kept[name] = slimValue(schema, depth);
	}
	return { dropped, properties: kept };
};

// Model-facing only; the MCP wire keeps the full schema.
export const slimToolSchema = (
	value: JsonSchemaObject,
	depth = 0,
): JsonSchemaObject => {
	const slimmed: JsonSchemaObject = {};
	let dropped = new Set<string>();
	for (const [key, entry] of Object.entries(value)) {
		// `default` is dropped so the model stops volunteering values it should
		// leave out; the MCP wire keeps applying the real default.
		if (key === "examples" || key === "title" || key === "default") continue;
		if (key === "internal" || key === "x-internal") continue;
		if (key === "description") {
			if (depth <= DESCRIPTION_DEPTH_MAX) slimmed[key] = entry;
			continue;
		}
		if (key === "properties" && entry && !Array.isArray(entry)) {
			const slim = slimProperties(entry as JsonSchemaObject, depth + 1);
			dropped = slim.dropped;
			slimmed[key] = slim.properties;
			continue;
		}
		slimmed[key] = slimValue(entry, depth + 1);
	}
	// A required entry naming a dropped property is an unsatisfiable schema.
	if (dropped.size && Array.isArray(slimmed.required)) {
		slimmed.required = slimmed.required.filter(
			(name) => !dropped.has(name as string),
		);
	}
	return slimmed;
};
