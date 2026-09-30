import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { authenticateRequest } from "../../internal/auth/actions/authenticateRequest.ts";
import { createTwdMcpServer } from "../../internal/mcp/actions/createTwdMcpServer.ts";
import { createContext } from "../../lib/createContext.ts";
import type { TwdHono } from "../types/twdHono.ts";

const methodNotAllowed = {
	jsonrpc: "2.0",
	error: {
		code: -32000,
		message:
			"twd's MCP endpoint is stateless: send JSON-RPC requests with POST /mcp.",
	},
	id: null,
};

export const mcpRoutes = new Hono<TwdHono>()
	.post("/mcp", async (c) => {
		const actor =
			c.get("ctx")?.actor ??
			(await authenticateRequest({ request: c.req.raw }));
		if (!actor) {
			c.header(
				"WWW-Authenticate",
				'Bearer realm="twd", error_description="Send Authorization: Bearer twd_... or sign in"',
			);
			return c.json(
				{
					error: {
						code: "unauthenticated",
						message:
							"twd MCP requires a twd API key (Authorization: Bearer twd_...) or a signed-in session.",
						next: "Configure your MCP client with an Authorization: Bearer twd_... header, then retry.",
						escalate:
							"Ask your human to mint a twd API key in the twd dashboard (API keys) and add it to your MCP config.",
					},
				},
				401,
			);
		}

		const server = createTwdMcpServer({
			ctx: { ...(c.get("ctx") ?? createContext()), actor },
		});
		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
		await server.connect(transport);
		return transport.handleRequest(c.req.raw);
	})
	.on(["GET", "DELETE"], "/mcp", (c) => {
		c.header("Allow", "POST");
		return c.json(methodNotAllowed, 405);
	});
