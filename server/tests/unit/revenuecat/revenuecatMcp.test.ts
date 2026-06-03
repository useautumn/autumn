/**
 * Unit tests for callRcMcpTool — JSON-RPC tools/call against RC's MCP server,
 * parsing the SSE (`data:`) response and surfacing tool errors. fetch is injected.
 */

import { expect, mock, test } from "bun:test";
import chalk from "chalk";
import { callRcMcpTool } from "@/external/revenueCat/misc/revenuecatMcp.js";

const sse = (obj: unknown, status = 200) =>
	Promise.resolve(
		new Response(`event: message\ndata: ${JSON.stringify(obj)}\n\n`, {
			status,
			headers: { "Content-Type": "text/event-stream" },
		}),
	);

test(`${chalk.yellowBright("callRcMcpTool: posts JSON-RPC tools/call with bearer + parses SSE result")}`, async () => {
	const fetchImpl = mock(() => sse({ result: { isError: false, content: [] } }));

	const result = await callRcMcpTool({
		accessToken: "atk_abc",
		name: "create-product-prices",
		arguments: { project_id: "proj", product_id: "prod", prices: [] },
		fetchImpl: fetchImpl as unknown as typeof fetch,
	});

	const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
	expect(url.toString()).toBe("https://mcp.revenuecat.ai/mcp");
	expect((init.headers as Record<string, string>).Authorization).toBe("Bearer atk_abc");
	const sent = JSON.parse(init.body as string);
	expect(sent).toMatchObject({
		method: "tools/call",
		params: { name: "create-product-prices" },
	});
	expect(result).toEqual({ isError: false, content: [] });
});

test(`${chalk.yellowBright("callRcMcpTool: throws when the tool reports isError")}`, async () => {
	const fetchImpl = mock(() =>
		sse({ result: { isError: true, content: [{ type: "text", text: "nope" }] } }),
	);
	await expect(
		callRcMcpTool({
			accessToken: "t",
			name: "create-product-prices",
			arguments: {},
			fetchImpl: fetchImpl as unknown as typeof fetch,
		}),
	).rejects.toThrow(/create-product-prices/);
});

test(`${chalk.yellowBright("callRcMcpTool: throws on a JSON-RPC error")}`, async () => {
	const fetchImpl = mock(() => sse({ error: { message: "bad token" } }));
	await expect(
		callRcMcpTool({
			accessToken: "t",
			name: "x",
			arguments: {},
			fetchImpl: fetchImpl as unknown as typeof fetch,
		}),
	).rejects.toThrow(/bad token/);
});
