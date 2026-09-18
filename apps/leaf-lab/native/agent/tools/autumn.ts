import { defineDynamic, defineTool } from "eve/tools";
import { withApprovalDescriptionSchema } from "../../../../leaf/agent/lib/approvalDescriptionSchema.js";
import { GATED_WRITES } from "../../../../leaf/agent/lib/gatedWrites.js";
import { slimToolSchema } from "../../../../leaf/agent/lib/toolSchemaSlim.js";
import type { AutumnMcpToolMetadata } from "../../../../leaf/src/internal/autumnMcp/rpcClient.js";
import { nativeApprovalPolicy } from "../../lib/policy.js";
import { nativeBridgeRequest } from "../../lib/protocol.js";

export default defineDynamic({
	events: {
		"step.started": async (_event, ctx) => {
			const metadata = await nativeBridgeRequest<AutumnMcpToolMetadata[]>(
				"/tools",
				{ sessionId: ctx.session.id, messages: ctx.messages },
			);
			return Object.fromEntries(
				metadata.map((tool) => {
					const gated = GATED_WRITES.some(
						(write) => write.toolName === tool.name,
					);
					return [
						`autumn__${tool.name}`,
						defineTool({
							description: tool.description,
							inputSchema: slimToolSchema(
								gated
									? withApprovalDescriptionSchema(tool.inputSchema)
									: tool.inputSchema,
							),
							approval: async (approvalCtx) =>
								nativeApprovalPolicy({
									name: tool.name,
									gated,
									request: nativeBridgeRequest,
								})(approvalCtx),
							execute: async (args, toolCtx) => {
								const call = {
									sessionId: toolCtx.session.id,
									callId: toolCtx.callId,
									name: tool.name,
									args,
								};
								if (gated) await nativeBridgeRequest("/authorize", call);
								return nativeBridgeRequest("/call", call);
							},
						}),
					];
				}),
			);
		},
	},
});
