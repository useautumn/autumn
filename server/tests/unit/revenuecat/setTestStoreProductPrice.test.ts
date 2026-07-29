/**
 * Regression: RC's `create-product-prices` MCP tool requires `prices` nested
 * under `body`. A top-level `prices` is rejected (additionalProperties:false)
 * and surfaces as a generic HTTP 500, silently leaving the test-store product
 * with no price. This locks the request shape.
 */

import { expect, test } from "bun:test";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli";

test("setTestStoreProductPrice nests prices under body for create-product-prices", async () => {
	let capturedBody: Record<string, unknown> | undefined;

	const mockFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		capturedBody = JSON.parse(init?.body as string);
		return new Response(
			`data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [] } })}\n`,
			{ status: 200, headers: { "Content-Type": "text/event-stream" } },
		);
	}) as typeof fetch;

	const cli = initRevenuecatCli({
		projectId: "proj_test",
		accessToken: "atk_test",
		fetchImpl: mockFetch,
	});

	await cli.setTestStoreProductPrice("prod_test", {
		amountMicros: 10_000_000,
		currency: "USD",
	});

	const params = capturedBody?.params as {
		name: string;
		arguments: Record<string, unknown>;
	};
	expect(params.name).toBe("create-product-prices");
	expect(params.arguments.body).toEqual({
		prices: [{ amount_micros: 10_000_000, currency: "USD" }],
	});
	// The stray top-level `prices` (the bug) must not be present.
	expect(params.arguments.prices).toBeUndefined();
});
