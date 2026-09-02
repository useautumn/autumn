import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { autumnMcpInstructions } from "@autumn/agent-docs/agent";
import { withAgentDocResources } from "@autumn/agent-docs/mcp";
import { MCPServer } from "@mastra/mcp";
import { setAnalyticsSink } from "../../../../../../packages/mcp/src/analytics/analyticsSink.js";
import { createAutumnMcpResources } from "../../../../../../packages/mcp/src/resources/index.js";
import type { AutumnMcpAuth } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import { createRawAutumnOperationTools } from "../../../../../../packages/mcp/src/tools/index.js";
import type { EvalMcpServer } from "./types.js";

const closeServer = ({
	server,
	sockets,
}: {
	server: Server;
	sockets: Set<Socket>;
}) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
		server.closeAllConnections?.();
		for (const socket of sockets) socket.destroy();
	});

// Serve the same generated agent-doc resources as production. Built with a
// runtime baseUrl because the bundled eval has no import.meta.url.
const evalResources = withAgentDocResources(
	createAutumnMcpResources({
		baseUrl: pathToFileURL(
			resolve(process.cwd(), "../../packages/mcp/src/resources/index.ts"),
		).href,
	}),
);

const createEvalMcpServer = () =>
	new MCPServer({
		id: "autumn-mcp-eval",
		name: "Autumn MCP Eval",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions: autumnMcpInstructions,
		resources: evalResources,
		tools: createRawAutumnOperationTools(),
	});

export const createAutumnMcpServer = (auth: AutumnMcpAuth) =>
	new Promise<EvalMcpServer>((resolve) => {
		setAnalyticsSink(null);
		const sockets = new Set<Socket>();
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
		server.on("connection", (socket) => {
			sockets.add(socket);
			socket.once("close", () => sockets.delete(socket));
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				throw new Error("MCP eval server did not bind to a TCP port.");
			}
			resolve({
				close: () => closeServer({ server, sockets }),
				url: new URL(`http://127.0.0.1:${address.port}/mcp`),
			});
		});
	});
