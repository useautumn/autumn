import type { AutumnLogger } from "@autumn/logging";
import type { MCPServerFlags, OAuthEnvironment } from "@autumn/mcp";
import type { HttpBindings } from "@hono/node-server";
import type { Context, Hono } from "hono";

export interface McpRouteOptions extends MCPServerFlags {
	readonly "oauth-enabled": boolean;
	readonly "oauth-environment": OAuthEnvironment;
	readonly logger: AutumnLogger;
	readonly resourceUrl: string;
}

export type LeafMcpContext = Context<{ Bindings: HttpBindings }>;
export type LeafMcpRouter = Hono<{ Bindings: HttpBindings }>;
export type { MCPOAuthFlags } from "./auth/resolveRequestAuth.js";
