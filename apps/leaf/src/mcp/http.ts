import { randomUUID } from "node:crypto";
import type { AutumnLogger } from "@autumn/logging";
import {
	buildAuthForRequest,
	createAutumnOperationsMCPServer,
	getAuthorizationServerMetadata,
	getProtectedResourceMetadata,
	type MCPServerFlags,
	type OAuthEnvironment,
	OAuthHttpError,
} from "@autumn/mcp";
import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import type { Context, Hono } from "hono";

export interface McpRouteOptions extends MCPServerFlags {
	readonly "oauth-enabled": boolean;
	readonly "oauth-environment": OAuthEnvironment;
	readonly logger: AutumnLogger;
}

type AppContext = Context<{ Bindings: HttpBindings }>;
type McpPath = "/mcp";
type McpApp = Hono<{ Bindings: HttpBindings }>;

export function registerMcpRoutes(app: McpApp, options: McpRouteOptions) {
	const mcpServer = createAutumnOperationsMCPServer();

	app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
		c.json(getProtectedResourceMetadata(c.req.raw.headers, options, "/mcp")),
	);

	app.get("/.well-known/oauth-authorization-server", (c) =>
		c.json(getAuthorizationServerMetadata(options)),
	);

	const handleMcp = async (
		c: AppContext,
		path: McpPath,
		server: ReturnType<typeof createAutumnOperationsMCPServer>,
	) => {
		let auth: Awaited<ReturnType<typeof buildAuthForRequest>>;
		try {
			auth = await buildAuthForRequest(
				c.req.raw.headers,
				options,
				options.logger,
				path,
			);
		} catch (error) {
			if (error instanceof OAuthHttpError) {
				if (error.wwwAuthenticate) {
					c.header("WWW-Authenticate", error.wwwAuthenticate);
				}
				return c.json(
					{ error: error.error, error_description: error.message },
					{ status: error.status as 401 | 403 },
				);
			}
			throw error;
		}

		(c.env.incoming as typeof c.env.incoming & { auth?: typeof auth }).auth =
			auth;
		await server.startHTTP({
			url: new URL(c.req.url),
			httpPath: path,
			req: c.env.incoming,
			res: c.env.outgoing,
			options: { sessionIdGenerator: randomUUID },
		});
		return RESPONSE_ALREADY_SENT;
	};

	app.all("/mcp", (c) => handleMcp(c, "/mcp", mcpServer));

	return app;
}
