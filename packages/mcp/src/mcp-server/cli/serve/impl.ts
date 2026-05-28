import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import type { Context } from "hono";
import { Hono } from "hono";
import {
  createAskAutumnMCPServer,
  createAutumnOperationsMCPServer,
} from "../../agent/server.js";
import { LocalContext } from "../../cli.js";
import {
  ConsoleLoggerLevel,
  createConsoleLogger,
} from "../../console-logger.js";
import { MCPServerFlags } from "../../flags.js";
import {
  buildAuthForRequest,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  OAuthEnvironment,
  OAuthHttpError,
} from "../../oauth.js";

interface ServeCommandFlags extends MCPServerFlags {
  readonly port: number;
  readonly "oauth-enabled": boolean;
  readonly "oauth-environment": OAuthEnvironment;
  readonly "log-level": ConsoleLoggerLevel;
  readonly env?: [string, string][];
}

type AppContext = Context<{ Bindings: HttpBindings }>;

export async function main(this: LocalContext, flags: ServeCommandFlags) {
  flags.env?.forEach(([key, value]) => {
    process.env[key] = value;
  });

  await startStreamableHTTP(flags);
}

async function startStreamableHTTP(cliFlags: ServeCommandFlags) {
  const logger = createConsoleLogger(cliFlags["log-level"]);
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Allow-Headers", "*");
    return c.req.method === "OPTIONS" ? c.body(null, 204) : next();
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
    return c.json(getProtectedResourceMetadata(c.req.raw.headers, cliFlags, "/mcp"));
  });

  app.get("/.well-known/oauth-protected-resource/internal/mcp", (c) => {
    return c.json(
      getProtectedResourceMetadata(c.req.raw.headers, cliFlags, "/internal/mcp"),
    );
  });

  app.get("/.well-known/oauth-authorization-server", (c) => {
    return c.json(getAuthorizationServerMetadata(cliFlags));
  });

  const handleMcp = async (
    c: AppContext,
    path: "/mcp" | "/internal/mcp",
    server: ReturnType<typeof createAskAutumnMCPServer>,
  ) => {
    let auth;
    try {
      auth = await buildAuthForRequest(c.req.raw.headers, cliFlags, logger, path);
    } catch (error) {
      if (error instanceof OAuthHttpError) {
        if (error.wwwAuthenticate) {
          c.header("WWW-Authenticate", error.wwwAuthenticate);
        }
        return c.json({
          error: error.error,
          error_description: error.message,
        }, { status: error.status as 401 | 403 });
      }
      throw error;
    }

    (c.env.incoming as typeof c.env.incoming & { auth?: typeof auth }).auth = auth;
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

  const httpServer = serve({
    fetch: app.fetch,
    port: cliFlags.port,
    hostname: "0.0.0.0",
  }, ({ address, port }) => {
    const host = `${address}:${port}`;
    logger.info("MCP Streamable HTTP server started", { host });
  });

  const shutdown = () => {
    logger.info("Shutting down HTTP server");

    const timer = setTimeout(() => {
      logger.info("Forcing shutdown");
      process.exit(1);
    }, 5000);

    httpServer.close(() => {
      clearTimeout(timer);
      logger.info("Graceful shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
