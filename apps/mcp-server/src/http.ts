import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import {
	buildAuthForRequest,
	createAskAutumnMCPServer,
	createAutumnOperationsMCPServer,
	getAuthorizationServerMetadata,
	getProtectedResourceMetadata,
	type ConsoleLogger,
	type MCPServerFlags,
	type OAuthEnvironment,
	OAuthHttpError,
} from "@autumn/mcp";
import type { Context } from "hono";
import { Hono } from "hono";

export interface CreateMcpHttpAppOptions extends MCPServerFlags {
	readonly "oauth-enabled": boolean;
	readonly "oauth-environment": OAuthEnvironment;
	readonly logger: ConsoleLogger;
}

type AppContext = Context<{ Bindings: HttpBindings }>;
type McpPath = "/mcp" | "/internal/mcp";

export function createMcpHttpApp(options: CreateMcpHttpAppOptions) {
	const app = new Hono<{ Bindings: HttpBindings }>();

	app.use("*", async (c, next) => {
		c.header("Access-Control-Allow-Origin", "*");
		c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		c.header("Access-Control-Allow-Headers", "*");
		return c.req.method === "OPTIONS" ? c.body(null, 204) : next();
	});

	app.get("/health", (c) => c.json({ ok: true }));

	app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
		c.json(getProtectedResourceMetadata(c.req.raw.headers, options, "/mcp")),
	);

	app.get("/.well-known/oauth-protected-resource/internal/mcp", (c) =>
		c.json(
			getProtectedResourceMetadata(
				c.req.raw.headers,
				options,
				"/internal/mcp",
			),
		),
	);

	app.get("/.well-known/oauth-authorization-server", (c) =>
		c.json(getAuthorizationServerMetadata(options)),
	);

	const handleMcp = async (
		c: AppContext,
		path: McpPath,
		server: ReturnType<typeof createAskAutumnMCPServer>,
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
			options: { serverless: true },
		});
		return RESPONSE_ALREADY_SENT;
	};

	app.all("/mcp", (c) =>
		handleMcp(c, "/mcp", createAutumnOperationsMCPServer()),
	);
	app.all("/internal/mcp", (c) =>
		handleMcp(c, "/internal/mcp", createAskAutumnMCPServer()),
	);

	return app;
}
