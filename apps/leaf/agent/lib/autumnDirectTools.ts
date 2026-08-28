import { defineDynamic, defineTool } from "eve/tools";
import { withoutApprovalSummary } from "../../src/internal/approvals/utils/approvalSummary.js";
import { callAutumnMcpTool } from "../../src/internal/autumnMcp/rpcClient.js";
import { approvalSets } from "./approvalSets.js";
import { withApprovalSummarySchema } from "./approvalSummarySchema.js";
import {
	type LeafPrincipalAttributes,
	mintCachedAutumnToken,
} from "./autumnAuth.js";
import { leafMcpBaseUrl, serverToolMetadata } from "./autumnToolMetadata.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";
import { slimToolSchema } from "./toolSchemaSlim.js";

/** Pre-registers the agent's allowlisted Autumn tools on every step with the
 * exact server schemas, so no discovery round trip is needed. */
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
				const entries: Record<string, ReturnType<typeof defineTool>> = {};
				for (const tool of metadata) {
					if (!allowlist.has(tool.name)) continue;
					const qualified = `autumn__${tool.name}`;
					const toolName = tool.name;
					const requiresApproval = approvalToolNames.has(toolName);
					const gatedBillingWrite = agent === "billing" && requiresApproval;
					const inputSchema = slimToolSchema(tool.inputSchema);
					entries[qualified] = defineTool({
						approval: () =>
							requiresApproval ? "user-approval" : "not-applicable",
						description: tool.description,
						execute: async (input, toolCtx) => {
							const minted = await mintCachedAutumnToken(
								toolCtx.session.auth.current?.attributes,
							);
							return callAutumnMcpTool({
								args: gatedBillingWrite
									? withoutApprovalSummary(input as Record<string, unknown>)
									: (input as Record<string, unknown>),
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv,
								token: minted.accessToken,
								toolName,
							});
						},
						inputSchema: gatedBillingWrite
							? withApprovalSummarySchema(inputSchema)
							: inputSchema,
					});
				}
				return entries;
			},
		},
	});
};
