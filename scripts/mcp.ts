import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.MCP_PORT ?? "2718";
const serverUrl = process.env.MCP_SERVER_URL ?? "http://localhost:8080";
const resourceUrl =
	process.env.MCP_RESOURCE_URL ?? `http://localhost:${port}/mcp`;
const issuerUrl = process.env.MCP_OAUTH_ISSUER_URL ?? `${serverUrl}/api/auth`;
const apiKeyUrl =
	process.env.MCP_OAUTH_API_KEY_URL ?? `${serverUrl}/cli/api-keys`;

function run(command: string, args: string[]) {
	const child = spawn(command, args, {
		cwd: rootDir,
		env: {
			...process.env,
			MCP_DEBUG_PENDING_ACTIONS:
				process.env.MCP_DEBUG_PENDING_ACTIONS ?? "1",
		},
		stdio: "inherit",
	});

	return new Promise<void>((resolve, reject) => {
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolve();
			else
				reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
		});
	});
}

await run("bun", [
	"--watch",
	"packages/mcp/src/mcp-server/mcp-server.ts",
	"serve",
	"--port",
	port,
	"--oauth-enabled",
	"--disable-static-auth",
	"--oauth-resource-url",
	resourceUrl,
	"--oauth-issuer-url",
	issuerUrl,
	"--oauth-api-key-url",
	apiKeyUrl,
	"--server-url",
	serverUrl,
	...process.argv.slice(2),
]);
