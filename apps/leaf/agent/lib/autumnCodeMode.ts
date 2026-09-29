import { jsonSchema } from "ai";
import { callscript } from "callscript";
import { fromAISDKTools } from "callscript/ai-sdk";
import { defineTool, type ToolContext } from "eve/tools";
import type { JsonSchemaObject } from "../../src/internal/autumnMcp/rpcClient.js";

/** An Autumn tool as code mode mounts it: the same executor the direct
 * `autumn__*` tool runs; approval-gated writes are never mounted. */
export type CodeModeTool = {
	description: string;
	execute: (input: Record<string, unknown>, ctx: ToolContext) => unknown;
	inputSchema: JsonSchemaObject;
};

const CODE_MODE_NAMESPACE = "autumn";

/** Scripts run inside one Eve tool call, so each engine is bound to that
 * call's context; search/describe never execute a tool. */
const autumnScriptEngine = ({
	toolCtx,
	tools,
}: {
	toolCtx?: ToolContext;
	tools: Record<string, CodeModeTool>;
}) => {
	const aiSdkTools = Object.fromEntries(
		Object.entries(tools).map(([name, tool]) => [
			name,
			{
				description: tool.description,
				execute: (input: Record<string, unknown>) => {
					if (!toolCtx) throw new Error(`${name} needs a tool call context`);
					return tool.execute(input, toolCtx);
				},
				inputSchema: jsonSchema(tool.inputSchema),
			},
		]),
	);
	return callscript({
		tools: fromAISDKTools(aiSdkTools, { namespace: CODE_MODE_NAMESPACE }),
	});
};

/** Exposes the Autumn tools as a callscript engine: `execute` runs a script
 * over them, `search`/`describe` let the model discover their signatures. */
export const autumnCodeModeTools = ({
	tools,
}: {
	tools: Record<string, CodeModeTool>;
}) => {
	const { describe, execute, search } = autumnScriptEngine({ tools }).tools();
	return {
		describe: defineTool({
			approval: () => "not-applicable",
			description: describe.description,
			execute: (input) => describe.execute(input as { names: string[] }),
			inputSchema: describe.inputSchema as JsonSchemaObject,
		}),
		execute: defineTool({
			approval: () => "not-applicable",
			description: execute.description,
			execute: (input, toolCtx) =>
				autumnScriptEngine({ toolCtx, tools }).tools().execute.execute(input),
			inputSchema: execute.inputSchema as JsonSchemaObject,
		}),
		search: defineTool({
			approval: () => "not-applicable",
			description: search.description,
			execute: (input) => search.execute(input as { query: string }),
			inputSchema: search.inputSchema as JsonSchemaObject,
		}),
	};
};
