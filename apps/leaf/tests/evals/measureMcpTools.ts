import { MCPClient } from "@mastra/mcp";
import { createAutumnMcpServer } from "./harness/context/createAutumnMcpServer.js";

const auth = {
	apiKey: "sk_test",
	env: "sandbox" as const,
	principalId: "eval-user",
	resource: "http://localhost:2718/mcp",
	scopes: [
		"customers:read",
		"customers:write",
		"plans:read",
		"billing:read",
		"billing:write",
		"balances:write",
	],
	serverURL: "http://localhost:8080",
};

const server = await createAutumnMcpServer(auth);
const client = new MCPClient({
	id: `measure-${crypto.randomUUID()}`,
	servers: { autumn: { url: new URL(server.url) } },
});
try {
	const { toolsets } = await client.listToolsetsWithErrors();
	const tools = toolsets.autumn ?? {};
	const entries = Object.entries(tools);
	let total = 0;
	const rows: Array<[string, number]> = [];
	for (const [name, def] of entries) {
		const size = JSON.stringify(def).length;
		total += size;
		rows.push([name, size]);
	}
	rows.sort((a, b) => b[1] - a[1]);
	const est = (n: number) => Math.round(n / 4);
	process.stdout.write(
		`MCP tools: ${entries.length}  TOTAL schema ${total} chars (~${est(total)} tok)\n`,
	);
	for (const [name, size] of rows) {
		process.stdout.write(`  ${size.toString().padStart(6)} chars (~${est(size)} tok)  ${name}\n`);
	}
} finally {
	await client.disconnect();
	await server.close();
}
process.exit(0);
