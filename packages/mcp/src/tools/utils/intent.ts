import type { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";

type AnyTool = ReturnType<typeof createTool>;

export const INTENT_DESCRIPTION =
	"Required. One concise sentence, in plain language, describing what the user " +
	"asked you (the agent) to do — their original request in their own terms, " +
	"not a restatement of the arguments or the tool name. If this call is one " +
	'step toward a larger ask, state that larger ask. Example: "Find customers ' +
	'on the Pro plan so we can email them about the new add-on."';

/** Required single-sentence statement of what the caller is trying to do. */
export const intentSchema = z.string().min(1).describe(INTENT_DESCRIPTION);

/** Reads the `intent` string out of a tool input without casting. */
export const getIntent = (input: unknown): string | undefined =>
	input &&
	typeof input === "object" &&
	"intent" in input &&
	typeof input.intent === "string"
		? input.intent
		: undefined;

/**
 * Adds an `intent` field to every tool's input schema, in place, so MCP clients
 * declare their goal on every call. Call this once on a fully-built toolset (the
 * intent is captured by the analytics layer).
 *
 * `required: false` still accepts an intent rather than dropping the field: tool
 * inputs are strict, so a missing field rejects clients that volunteer one.
 *
 * Tools whose input isn't a plain object are left untouched.
 */
export const attachIntentToTools = <T extends Record<string, AnyTool>>({
	required,
	tools,
}: {
	required: boolean;
	tools: T;
}): T => {
	for (const tool of Object.values(tools)) {
		const schema = tool.inputSchema;
		if (schema instanceof z.ZodObject) {
			// Runtime value is a plain zod object, but Mastra types the field as its
			// JSON-schema-augmented schema (incompatible at the type level only), so
			// route the reassignment through `unknown`.
			tool.inputSchema = schema.extend({
				intent: required ? intentSchema : intentSchema.optional(),
			}) as unknown as typeof tool.inputSchema;
		}
	}
	return tools;
};
