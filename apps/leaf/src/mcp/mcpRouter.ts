import { createAutumnOperationsMCPServer } from "@autumn/mcp";
import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { MCP_PATH, PROTECTED_RESOURCE_METADATA_PATH } from "./constants.js";
import { createHandleMcp } from "./handlers/handleMcp.js";
import { createHandleProtectedResourceMetadata } from "./handlers/handleProtectedResourceMetadata.js";
import type { McpRouteOptions } from "./types.js";

export const createMcpRouter = (options: McpRouteOptions) => {
	const router = new Hono<{ Bindings: HttpBindings }>();
	// Our own agent connects here — don't force the analytics `intent` field on it
	// (it occasionally omits it, which would fail the tool call).
	const mcpServer = createAutumnOperationsMCPServer({ requireIntent: false });

	router.get(
		PROTECTED_RESOURCE_METADATA_PATH,
		createHandleProtectedResourceMetadata({
			options,
		}),
	);
	router.all(
		MCP_PATH,
		createHandleMcp({
			options,
			path: MCP_PATH,
			server: mcpServer,
		}),
	);

	return router;
};
