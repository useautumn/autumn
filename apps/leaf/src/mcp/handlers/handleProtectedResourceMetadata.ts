import { getProtectedResourceMetadata } from "../auth/protectedResourceMetadata.js";
import type { LeafMcpContext, McpRouteOptions } from "../types.js";

export const createHandleProtectedResourceMetadata =
	({ options }: { options: McpRouteOptions }) =>
	(c: LeafMcpContext) =>
		c.json(
			getProtectedResourceMetadata({
				resourceUrl: options.resourceUrl,
				serverURL: options["server-url"],
			}),
		);
