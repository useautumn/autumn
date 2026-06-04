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

	// Streamable-HTTP MCP replies as SSE and may emit preamble frames (ping,
	// progress) before the result — pick the frame that carries result/error.
	const text = await response.text();
	const candidates = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("data:") || line.startsWith("{"))
		.map((line) => line.replace(/^data:\s*/, ""));

	let parsed: JsonRpcResult | undefined;
	for (const candidate of candidates) {
		let frame: JsonRpcResult;
		try {
			frame = JSON.parse(candidate) as JsonRpcResult;
		} catch {
			continue;
		}
		if (frame.result !== undefined || frame.error !== undefined) {
			parsed = frame;
			break;
		}
	}

	if (!parsed) {
		throw new Error(
			`RevenueCat MCP returned no result frame: ${text.slice(0, 200)}`,
		);
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
