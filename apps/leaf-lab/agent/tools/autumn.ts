import { defineDynamic, defineTool } from "eve/tools";
import { slimToolSchema } from "../../../leaf/agent/lib/toolSchemaSlim.js";
import type { AutumnMcpToolMetadata } from "../../../leaf/src/internal/autumnMcp/rpcClient.js";
import { bridgeRequest } from "../../lib/bridgeClient.js";

export default defineDynamic({
	events: {
		"step.started": async () => {
			const tools = await bridgeRequest<AutumnMcpToolMetadata[]>("/tools");
			return Object.fromEntries(
				tools.map((tool) => [
					`autumn__${tool.name}`,
					defineTool({
						description: tool.description,
						inputSchema: slimToolSchema(tool.inputSchema),
						approval: () => "not-applicable",
						execute: (args) =>
							bridgeRequest("/call", { name: tool.name, args }),
					}),
				]),
			);
		},
	},
});
