import { getProtectedResourceMetadata } from "@autumn/auth/oauth";
import { DEFAULT_AUTUMN_API_URL } from "@autumn/mcp";
import type { LeafMcpContext, McpRouteOptions } from "../types.js";

export const createHandleProtectedResourceMetadata =
	({ options }: { options: McpRouteOptions }) =>
	(c: LeafMcpContext) =>
		c.json(
			getProtectedResourceMetadata({
				issuerBaseUrl: options["server-url"] ?? DEFAULT_AUTUMN_API_URL,
				resourceName: "Autumn MCP",
				resourceUrl: options.resourceUrl,
			}),
		);
