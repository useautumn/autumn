import { createAutumnMcpHost } from "./server.js";

const port = Number(process.env.MCP_PORT ?? 3100);
const server = createAutumnMcpHost();

await server.listen(port);
console.log(`Autumn MCP host listening on http://localhost:${port}/mcp`);
