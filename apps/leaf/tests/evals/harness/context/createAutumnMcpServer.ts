import { createServer, type IncomingMessage, type Server } from "node:http";
import { MCPServer } from "@mastra/mcp";
import { setAnalyticsSink } from "../../../../../../packages/mcp/src/analytics/analyticsSink.js";
import type { AutumnMcpAuth } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import { createRawAutumnOperationTools } from "../../../../../../packages/mcp/src/tools/index.js";
import type { EvalMcpServer } from "./types.js";

const closeServer = (server: Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});

const createEvalMcpServer = () =>
	new MCPServer({
		id: "autumn-mcp-eval",
		name: "Autumn MCP Eval",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions:
			"Use preview tools before billing writes. Write tools are destructive and should only be called after explicit user confirmation.",
		tools: createRawAutumnOperationTools(),
	});

export const createAutumnMcpServer = (auth: AutumnMcpAuth) =>
	new Promise<EvalMcpServer>((resolve) => {
		setAnalyticsSink(null);
		const server = createServer(async (req, res) => {
			const url = new URL(req.url ?? "/mcp", `http://${req.headers.host}`);
			if (url.pathname !== "/mcp") {
				res.writeHead(404).end();
				return;
			}

			(req as IncomingMessage & { auth?: AutumnMcpAuth }).auth = auth;
			await createEvalMcpServer().startHTTP({
				httpPath: "/mcp",
				options: { serverless: true },
				req,
				res,
				url,
			});
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				throw new Error("MCP eval server did not bind to a TCP port.");
			}
			resolve({
				close: () => closeServer(server),
				url: new URL(`http://127.0.0.1:${address.port}/mcp`),
			});
		});
	});
