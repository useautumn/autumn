import type {
	JsonSchemaObject,
	JsonValue,
} from "../../src/internal/autumnMcp/rpcClient.js";

const DESCRIPTION_DEPTH_MAX = 5;

const slimValue = (value: JsonValue, depth: number): JsonValue => {
	if (Array.isArray(value)) {
		return value.map((entry) => slimValue(entry, depth));
	}
	if (!value || typeof value !== "object") return value;
	return slimToolSchema(value, depth);
};

/** Schema descriptions are ~half the tool-definition bytes the model
 * reprocesses every turn; below the request's own fields they add tokens,
 * not accuracy — the billing skill documents the deep shapes. Model-facing
 * only; the MCP wire is untouched. */
export const slimToolSchema = (
	value: JsonSchemaObject,
	depth = 0,
): JsonSchemaObject => {
	const slimmed: JsonSchemaObject = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === "examples" || key === "title") continue;
		if (key === "description") {
			if (depth <= DESCRIPTION_DEPTH_MAX) slimmed[key] = entry;
			continue;
		}
		slimmed[key] = slimValue(entry, depth + 1);
	}
	return slimmed;
};
