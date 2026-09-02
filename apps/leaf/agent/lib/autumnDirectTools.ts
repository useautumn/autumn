import { defineDynamic, defineTool } from "eve/tools";
import { callAutumnMcpTool } from "../../src/internal/autumnMcp/rpcClient.js";
import { withApprovalDescriptionSchema } from "./approvalDescriptionSchema.js";
import { approvalSets } from "./approvalSets.js";
import {
	type LeafPrincipalAttributes,
	mintCachedAutumnToken,
} from "./autumnAuth.js";
import { leafMcpBaseUrl, serverToolMetadata } from "./autumnToolMetadata.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";
import { slimToolSchema } from "./toolSchemaSlim.js";

// Billing decisions need payment method + plans up front; strict validation
// means the expand must live inside `request`, not beside it.
const DEFAULT_CUSTOMER_EXPAND = ["payment_method", "subscriptions.plan"];

export const withCustomerExpand = (input: Record<string, unknown>) => {
	const request = input.request;
	if (!request || typeof request !== "object" || Array.isArray(request)) {
		return input;
	}
	const fields = request as Record<string, unknown>;
	if (fields.expand !== undefined) return input;
	return { ...input, request: { ...fields, expand: DEFAULT_CUSTOMER_EXPAND } };
};

/** What a gated write returns to the model. The card is the user's decision
 * point, so the turn ends here rather than waiting on it. */
const RECORDED_FOR_APPROVAL =
	"Recorded for approval. The user sees an approval card with the exact " +
	"change and applies it from there. Do not call this write again, and do " +
	"not tell the user it has been applied.";

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
					const inputSchema = slimToolSchema(tool.inputSchema);
					entries[qualified] = defineTool({
						// Gated writes record and end the turn; leaf applies on approval.
						approval: () => "not-applicable",
						description: tool.description,
						execute: async (input, toolCtx) => {
							if (requiresApproval) return RECORDED_FOR_APPROVAL;
							const minted = await mintCachedAutumnToken(
								toolCtx.session.auth.current?.attributes,
							);
							const args = input as Record<string, unknown>;
							return callAutumnMcpTool({
								args:
									toolName === "getCustomer" ? withCustomerExpand(args) : args,
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv,
								token: minted.accessToken,
								toolName,
							});
						},
						inputSchema: requiresApproval
							? withApprovalDescriptionSchema(inputSchema)
							: inputSchema,
					});
				}
				return entries;
			},
		},
	});
};
