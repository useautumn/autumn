import { join } from "node:path";

const port = process.env.MCP_PORT ?? "2718";
const serverUrl = process.env.MCP_SERVER_URL ?? "http://localhost:8080";

const child = Bun.spawn([
	"bun",
	"--watch",
	"packages/mcp/src/mcp-server/mcp-server.ts",
	"serve",
	"--port",
	port,
	"--oauth-enabled",
	"--server-url",
	serverUrl,
	...process.argv.slice(2),
], {
	cwd: join(import.meta.dir, ".."),
	env: {
		...process.env,
		MCP_DEBUG_PENDING_ACTIONS: process.env.MCP_DEBUG_PENDING_ACTIONS ?? "1",
	},
	stdin: "inherit",
	stdout: "inherit",
	stderr: "inherit",
});

process.exit(await child.exited);
