import express from "express";
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

import { landingPageExpress } from "../../../landing-page.js";

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
  const app = express();

  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  const getHeaders = (req: express.Request) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }
    return headers;
  };

  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    res.json(getProtectedResourceMetadata(getHeaders(req), cliFlags));
  });

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json(getAuthorizationServerMetadata(cliFlags));
  });

  app.all("/mcp", async (req, res) => {
    const headers = getHeaders(req);
    let auth;
    try {
      auth = await buildAuthForRequest(headers, cliFlags, logger);
    } catch (error) {
      if (error instanceof OAuthHttpError) {
        if (error.wwwAuthenticate) {
          res.header("WWW-Authenticate", error.wwwAuthenticate);
        }
        res.status(error.status).json({
          error: error.error,
          error_description: error.message,
        });
        return;
      }
      throw error;
    }

    (req as express.Request & { auth?: typeof auth }).auth = auth;
    const url = new URL(req.originalUrl || req.url, `http://${req.headers.host}`);
    await createAutumnMastraMCPServer().startHTTP({
      url,
      httpPath: "/mcp",
      req,
      res,
      options: { serverless: true },
    });
  });

  app.get("/", landingPageExpress);

  const httpServer = app.listen(cliFlags.port, "0.0.0.0", () => {
    const ha = httpServer.address();
    const host = typeof ha === "string" ? ha : `${ha?.address}:${ha?.port}`;
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
