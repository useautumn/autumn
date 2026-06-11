import { randomUUID } from "node:crypto";
import type { createAutumnOperationsMCPServer } from "@autumn/mcp";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { OAuthHttpError } from "../auth/protectedResourceMetadata.js";
import { buildAuthForRequest } from "../auth/resolveRequestAuth.js";
import type { LeafMcpContext, McpRouteOptions } from "../types.js";

type McpServer = ReturnType<typeof createAutumnOperationsMCPServer>;
type McpAuth = Awaited<ReturnType<typeof buildAuthForRequest>>;

const setIncomingAuth = ({ c, auth }: { c: LeafMcpContext; auth: McpAuth }) => {
	(c.env.incoming as typeof c.env.incoming & { auth?: McpAuth }).auth = auth;
};

const oauthErrorResponse = (c: LeafMcpContext, error: OAuthHttpError) => {
	if (error.wwwAuthenticate) {
		c.header("WWW-Authenticate", error.wwwAuthenticate);
	}

	return c.json(
		{ error: error.error, error_description: error.message },
		{ status: error.status as 400 | 401 | 403 },
	);
};

export const createHandleMcp =
	({
		options,
		path,
		server,
	}: {
		options: McpRouteOptions;
		path: string;
		server: McpServer;
	}) =>
	async (c: LeafMcpContext) => {
		let auth: McpAuth;
		try {
			auth = await buildAuthForRequest({
				headers: c.req.raw.headers,
				flags: options,
				logger: options.logger,
				resourceUrl: options.resourceUrl,
			});
		} catch (error) {
			if (error instanceof OAuthHttpError) {
				return oauthErrorResponse(c, error);
			}
			throw error;
		}

		setIncomingAuth({ c, auth });
		await server.startHTTP({
			url: new URL(c.req.url),
			httpPath: path,
			req: c.env.incoming,
			res: c.env.outgoing,
			options: { sessionIdGenerator: randomUUID },
		});
		return RESPONSE_ALREADY_SENT;
	};
