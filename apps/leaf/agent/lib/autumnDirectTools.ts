import { defineDynamic, defineTool } from "eve/tools";
import { callAutumnMcpTool } from "../../src/internal/autumnMcp/rpcClient.js";
import { withApprovalDescriptionSchema } from "./approvalDescriptionSchema.js";
import { approvalSets } from "./approvalSets.js";
import {
	type LeafPrincipalAttributes,
	mintCachedAutumnToken,
} from "./autumnAuth.js";
import { leafMcpBaseUrl, serverToolMetadata } from "./autumnToolMetadata.js";
import { previewLedger } from "./previewLedger.js";
import { isStripeCodeModeTool, stripeCodeModeTools } from "./stripeCodeMode.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";
import { slimToolSchema } from "./toolSchemaSlim.js";

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

const RECORDED_FOR_APPROVAL =
	"Recorded for approval. The user sees an approval card with the exact " +
	"change and applies it from there. Do not call this write again, and do " +
	"not tell the user it has been applied.";

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
					if (isStripeCodeModeTool(tool.name)) continue;
					const qualified = `autumn__${tool.name}`;
					const toolName = tool.name;
					const requiresApproval = approvalToolNames.has(toolName);
					const inputSchema = slimToolSchema(tool.inputSchema);
					entries[qualified] = defineTool({
						approval: () => "not-applicable",
						description: tool.description,
						execute: async (input, toolCtx) => {
							const args = input as Record<string, unknown>;
							if (requiresApproval) {
								const rejection = previewLedger.rejectionFor({
									args,
									toolName,
								});
								if (rejection) throw new Error(rejection);
								return RECORDED_FOR_APPROVAL;
							}
							const minted = await mintCachedAutumnToken(
								toolCtx.session.auth.current?.attributes,
							);
							const result = await callAutumnMcpTool({
								args:
									toolName === "getCustomer" ? withCustomerExpand(args) : args,
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv,
								token: minted.accessToken,
								toolName,
							});
							previewLedger.recordPreview({ args, result, toolName });
							return result;
						},
						inputSchema: requiresApproval
							? withApprovalDescriptionSchema(inputSchema)
							: inputSchema,
					});
				}
				return {
					...entries,
					...stripeCodeModeTools({
						specs: metadata.filter(
							(tool) =>
								allowlist.has(tool.name) && isStripeCodeModeTool(tool.name),
						),
					}),
				};
			},
		},
	});
};
