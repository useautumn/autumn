import { MCPServer } from "mcp-use";
import { z } from "zod";

/**
 * Host-only Autumn MCP server. Product tools still live on Leaf / `@autumn/mcp`.
 * This factory exists so tests can bind the same app without calling listen().
 */
export const createAutumnMcpHost = () => {
	const server = new MCPServer({
		name: "autumn-mcp",
		version: "0.0.1",
		description: "Autumn MCP host (scaffold).",
		basePath: "/mcp",
	});

	server.tool(
		{
			name: "ping",
			description: "Liveness check for the extracted MCP host.",
			inputSchema: z.object({}),
			outputSchema: z.object({
				ok: z.literal(true),
			}),
		},
		async () => {
			const data = { ok: true as const };
			return {
				content: [{ type: "text", text: "ok" }],
				structuredContent: data,
			};
		},
	);

	return server;
};
