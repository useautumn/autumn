import * as ngrok from "@ngrok/ngrok";

// Tunnel the local mock MCP so Anthropic's cloud loop can reach it. Use the
// DEDICATED eval domain (NGROK_MOCK_MCP_URL) so it never collides with the dev
// server's NGROK_URL — the eval runs without touching dev-services. One domain =
// one tunnel (sequential live evals); parallel would reserve a wildcard and use a
// random subdomain per run.
export const openMockTunnel = async ({ mockPort }: { mockPort: number }) => {
	// NGROK_MOCK_MCP_URL may be a bare host (`john-mcp.ngrok.app`) or a full URL.
	const domain = process.env.NGROK_MOCK_MCP_URL
		? process.env.NGROK_MOCK_MCP_URL.replace(/^https?:\/\//, "").replace(
				/\/.*$/,
				"",
			)
		: undefined;

	let listener: ngrok.Listener;
	try {
		listener = await ngrok.forward({
			addr: mockPort,
			authtoken: process.env.NGROK_AUTHTOKEN,
			domain,
		});
	} catch (error) {
		throw new Error(
			`ngrok tunnel for the eval mock MCP failed. Set NGROK_MOCK_MCP_URL to a dedicated reserved domain (separate from the dev server's NGROK_URL), or free the domain currently in use. Original: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	return {
		close: async () => {
			await listener.close().catch(() => {});
		},
		mcpUrl: new URL("/mcp", listener.url() ?? "").toString(),
	};
};
