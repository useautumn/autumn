import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AutumnMcpAuth } from "../../agent/auth.js";
import { principalFromSecret } from "../../agent/auth.js";
import { createAutumnMastraMCPServer } from "../../agent/server.js";
import { LocalContext } from "../../cli.js";
import {
	ConsoleLoggerLevel,
	createConsoleLogger,
} from "../../console-logger.js";
import { MCPServerFlags } from "../../flags.js";
import { MCP_OAUTH_SCOPES } from "../../oauth.js";

interface StartCommandFlags extends MCPServerFlags {
	readonly transport: "stdio" | "sse";
	readonly port: number;
	readonly "log-level": ConsoleLoggerLevel;
	readonly env?: [string, string][];
}

type AppContext = Context;

export async function main(this: LocalContext, flags: StartCommandFlags) {
	flags.env?.forEach(([key, value]) => {
		process.env[key] = value;
	});

	switch (flags.transport) {
		case "stdio":
			await startStdio(flags);
			break;
		case "sse":
			await startSSE(flags);
			break;
		default:
			throw new Error(`Invalid transport: ${flags.transport}`);
	}
}

const staticAuth = (flags: StartCommandFlags): AutumnMcpAuth => {
	const apiKey = flags["secret-key"] ?? "";
	return {
		apiKey,
		env: "sandbox",
		principalId: principalFromSecret("secret-key", apiKey),
		resource: "stdio",
		scopes: [...MCP_OAUTH_SCOPES],
		serverURL: flags["server-url"],
		xApiVersion: flags["x-api-version"],
		failOpen: flags["fail-open"],
	};
};

async function startStdio(flags: StartCommandFlags) {
	const server = createAutumnMastraMCPServer({ defaultAuth: staticAuth(flags) });
	await server.startStdio();
}

async function startSSE(flags: StartCommandFlags) {
	const logger = createConsoleLogger(flags["log-level"]);
	const app = new Hono();
	const server = createAutumnMastraMCPServer({ defaultAuth: staticAuth(flags) });

	const handleSSE = (c: AppContext) => {
		return server.startHonoSSE({
			url: new URL(c.req.url),
			ssePath: "/sse",
			messagePath: "/message",
			context: c as unknown as Parameters<typeof server.startHonoSSE>[0]["context"],
		});
	};

	app.all("/sse", handleSSE);
	app.all("/message", handleSSE);

	const httpServer = serve({
		fetch: app.fetch,
		port: flags.port,
		hostname: "0.0.0.0",
	}, ({ address, port }) => {
		const host = `${address}:${port}`;
		logger.info("MCP HTTP server started", { host });
	});

	const shutdown = async () => {
		logger.info("Shutting down HTTP server");
		await server.close();
		httpServer.close(() => process.exit(0));
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}
