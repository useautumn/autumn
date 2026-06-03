const RC_MCP_URL = "https://mcp.revenuecat.ai/mcp";

type JsonRpcResult = {
	result?: { isError?: boolean; content?: unknown };
	error?: { message?: string };
};

/**
 * Call a tool on RevenueCat's hosted MCP server (the only supported way to write
 * test-store prices). Auth is the org's RC token — OAuth (`atk_`) or secret (`sk_`).
 */
export const callRcMcpTool = async ({
	accessToken,
	name,
	arguments: args,
	fetchImpl = fetch,
}: {
	accessToken: string;
	name: string;
	arguments: Record<string, unknown>;
	fetchImpl?: typeof fetch;
}): Promise<unknown> => {
	const response = await fetchImpl(RC_MCP_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});

	if (!response.ok) {
		throw new Error(`RevenueCat MCP error (${response.status})`);
	}

	// Streamable-HTTP MCP replies as SSE: pull the JSON out of the `data:` line.
	const text = await response.text();
	const dataLine = text
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.startsWith("data:") || line.startsWith("{"));
	const payload = dataLine?.replace(/^data:\s*/, "") ?? text.trim();

	let parsed: JsonRpcResult;
	try {
		parsed = JSON.parse(payload) as JsonRpcResult;
	} catch {
		throw new Error(`RevenueCat MCP returned unparseable response: ${payload.slice(0, 200)}`);
	}

	if (parsed.error) {
		throw new Error(`RevenueCat MCP tool error: ${parsed.error.message ?? "unknown"}`);
	}
	if (parsed.result?.isError) {
		throw new Error(
			`RevenueCat MCP tool "${name}" failed: ${JSON.stringify(parsed.result.content).slice(0, 300)}`,
		);
	}

	return parsed.result;
};
