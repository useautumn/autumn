import { jsonSchema } from "ai";
import { callscript } from "callscript";
import { fromAISDKTools } from "callscript/ai-sdk";
import { defineTool, type ToolContext } from "eve/tools";
import {
	callAutumnMcpTool,
	type JsonSchemaObject,
} from "../../src/internal/autumnMcp/rpcClient.js";
import { mintCachedAutumnToken } from "./autumnAuth.js";
import { leafMcpBaseUrl } from "./autumnToolMetadata.js";

/** Script name → Autumn MCP tool. Only Stripe reads run in code mode. */
const STRIPE_SCRIPT_TOOLS = {
	get: "stripeRead",
	searchEndpoints: "searchStripeEndpoints",
} as const;

const STRIPE_MCP_TOOL_NAMES = new Set<string>(
	Object.values(STRIPE_SCRIPT_TOOLS),
);

export const isStripeCodeModeTool = (toolName: string) =>
	STRIPE_MCP_TOOL_NAMES.has(toolName);

type StripeToolSpec = {
	description: string;
	inputSchema: JsonSchemaObject;
	name: string;
};

const callStripeTool = async ({
	input,
	toolCtx,
	toolName,
}: {
	input: Record<string, unknown>;
	toolCtx: ToolContext;
	toolName: string;
}) => {
	const minted = await mintCachedAutumnToken(
		toolCtx.session.auth.current?.attributes,
	);
	return callAutumnMcpTool({
		args: input,
		baseUrl: leafMcpBaseUrl(),
		env: minted.appEnv,
		token: minted.accessToken,
		toolName,
	});
};

const stripeScriptEngine = ({
	specs,
	toolCtx,
}: {
	specs: StripeToolSpec[];
	toolCtx?: ToolContext;
}) => {
	const aiSdkTools = Object.fromEntries(
		Object.entries(STRIPE_SCRIPT_TOOLS).flatMap(([scriptName, toolName]) => {
			const spec = specs.find((candidate) => candidate.name === toolName);
			if (!spec) return [];
			return [
				[
					scriptName,
					{
						description: spec.description,
						execute: (input: Record<string, unknown>) => {
							if (!toolCtx) throw new Error(`${toolName} needs a tool context`);
							return callStripeTool({ input, toolCtx, toolName });
						},
						inputSchema: jsonSchema(spec.inputSchema),
					},
				],
			];
		}),
	);
	return callscript({
		tools: fromAISDKTools(aiSdkTools, { namespace: "stripe" }),
	}).tools();
};

/** Stripe reads as a callscript engine. Callbacks capture only `specs`
 * (plain data) because Eve persists dynamic tool callbacks durably. */
export const stripeCodeModeTools = ({
	specs: rawSpecs,
}: {
	specs: { description: string; inputSchema: unknown; name: string }[];
}) => {
	const specs: StripeToolSpec[] = rawSpecs.map((spec) => ({
		description: spec.description,
		inputSchema: spec.inputSchema as JsonSchemaObject,
		name: spec.name,
	}));
	if (specs.length === 0) return {};
	const engineTools = stripeScriptEngine({ specs });
	return {
		stripe_describe: defineTool({
			approval: () => "not-applicable",
			description: engineTools.describe.description,
			execute: (input) =>
				stripeScriptEngine({ specs }).describe.execute(
					input as { names: string[] },
				),
			inputSchema: engineTools.describe.inputSchema as JsonSchemaObject,
		}),
		stripe_execute: defineTool({
			approval: () => "not-applicable",
			description: `Run a script of read-only Stripe calls (stripe.get, stripe.searchEndpoints). ${engineTools.execute.description}`,
			execute: (input, toolCtx) =>
				stripeScriptEngine({ specs, toolCtx }).execute.execute(input),
			inputSchema: engineTools.execute.inputSchema as JsonSchemaObject,
		}),
		stripe_search: defineTool({
			approval: () => "not-applicable",
			description: engineTools.search.description,
			execute: (input) =>
				stripeScriptEngine({ specs }).search.execute(
					input as { query: string },
				),
			inputSchema: engineTools.search.inputSchema as JsonSchemaObject,
		}),
	};
};
