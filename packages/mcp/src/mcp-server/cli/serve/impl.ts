import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { Hono } from "hono";
import { createAutumnMastraMCPServer } from "../../agent/server.js";
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
  readonly "disable-static-auth": boolean;
  readonly "oauth-enabled": boolean;
  readonly "oauth-issuer-url"?: string | undefined;
  readonly "oauth-resource-url"?: string | undefined;
  readonly "oauth-api-key-url"?: string | undefined;
  readonly "oauth-environment": OAuthEnvironment;
  readonly "log-level": ConsoleLoggerLevel;
  readonly env?: [string, string][];
}

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
    return c.json(getProtectedResourceMetadata(c.req.raw.headers, cliFlags));
  });

  app.get("/.well-known/oauth-authorization-server", (c) => {
    return c.json(getAuthorizationServerMetadata(cliFlags));
  });

  app.all("/mcp", async (c) => {
    let auth;
    try {
      auth = await buildAuthForRequest(c.req.raw.headers, cliFlags, logger);
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
    await createAutumnMastraMCPServer().startHTTP({
      url: new URL(c.req.url),
      httpPath: "/mcp",
      req: c.env.incoming,
      res: c.env.outgoing,
      options: { serverless: true },
    });
    return RESPONSE_ALREADY_SENT;
  });

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
