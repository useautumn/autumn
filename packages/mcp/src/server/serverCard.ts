import { AUTUMN_MCP_VERSION } from "../constants.js";
import { createRawAutumnOperationTools } from "../tools/index.js";

const tools = Object.entries(
	createRawAutumnOperationTools({ requireIntent: false }),
).map(([name, tool]) => ({ name, description: tool.description }));

export const createAutumnMcpServerCard = ({
	serverUrl,
}: {
	serverUrl: string;
}) => ({
	name: "Autumn",
	description:
		"Inspect and manage Autumn billing catalogs, customers, subscriptions, balances, usage, and billing actions through typed tools.",
	version: AUTUMN_MCP_VERSION,
	serverUrl,
	tools,
});
