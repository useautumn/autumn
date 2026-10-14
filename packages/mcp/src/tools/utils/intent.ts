import type { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";

type AnyTool = ReturnType<typeof createTool>;

export const INTENT_DESCRIPTION =
	"Required. One concise sentence, in plain language, describing what the user " +
	"asked you (the agent) to do — their original request in their own terms, " +
	"not a restatement of the arguments or the tool name. If this call is one " +
	'step toward a larger ask, state that larger ask. Example: "Find customers ' +
	'on the Pro plan so we can email them about the new add-on."';

export const intentSchema = z.string().min(1).describe(INTENT_DESCRIPTION);

export const getIntent = (input: unknown): string | undefined =>
	input &&
	typeof input === "object" &&
	"intent" in input &&
	typeof input.intent === "string"
		? input.intent
		: undefined;

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
			tool.inputSchema = schema.extend({
				intent: required ? intentSchema : intentSchema.optional(),
			}) as unknown as typeof tool.inputSchema;
		}
	}
	return tools;
};
