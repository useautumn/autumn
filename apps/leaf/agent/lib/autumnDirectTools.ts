import { defineDynamic, defineTool } from "eve/tools";
import { callAutumnMcpTool } from "../../src/internal/autumnMcp/rpcClient.js";
import { approvalSets } from "./approvalSets.js";
import {
	type LeafPrincipalAttributes,
	mintCachedAutumnToken,
} from "./autumnAuth.js";
import { leafMcpBaseUrl, serverToolMetadata } from "./autumnToolMetadata.js";
import { discoveredConnectionToolNames } from "./discoveredConnectionTools.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";
import { slimToolSchema } from "./toolSchemaSlim.js";

/** Pre-registers the agent's allowlisted Autumn tools on every step with the
 * exact server schemas: the model never spends a turn on connection_search
 * and its ~90KB result never enters history. Approval gating matches the
 * connection's. */
export const autumnDirectTools = ({
	agent,
}: {
	agent: LeafAgentConnection;
}) => {
	const allowlist = new Set<string>(toolAllowlists[agent] ?? []);
	const approvalToolNames = approvalSets[agent];
	return defineDynamic({
		events: {
			"step.started": async (_event, ctx) => {
				const attributes = (ctx.session.auth.current?.attributes ??
					ctx.session.auth.initiator?.attributes) as
					| LeafPrincipalAttributes
					| undefined;
				if (!attributes?.orgId) return null;
				const { accessToken, appEnv } = await mintCachedAutumnToken(attributes);
				const metadata = await serverToolMetadata({
					appEnv,
					token: accessToken,
				});
				const alreadyDiscovered = discoveredConnectionToolNames(ctx.messages);
				const entries: Record<string, ReturnType<typeof defineTool>> = {};
				for (const tool of metadata) {
					if (!allowlist.has(tool.name)) continue;
					const qualified = `autumn__${tool.name}`;
					if (alreadyDiscovered.has(qualified)) continue;
					const toolName = tool.name;
					entries[qualified] = defineTool({
						approval: () =>
							approvalToolNames.has(toolName)
								? "user-approval"
								: "not-applicable",
						description: tool.description,
						execute: async (input, toolCtx) => {
							const minted = await mintCachedAutumnToken(
								toolCtx.session.auth.current?.attributes,
							);
							return callAutumnMcpTool({
								args: input as Record<string, unknown>,
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv,
								token: minted.accessToken,
								toolName,
							});
						},
						inputSchema: slimToolSchema(tool.inputSchema),
					});
				}
				return entries;
			},
		},
	});
};
