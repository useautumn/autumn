import { describe, expect, test } from "bun:test";
import { isPublicMcpDiscoveryRequest } from "../../../src/mcp/auth/isPublicMcpDiscoveryRequest.js";

const requestFor = (body: unknown) =>
	new Request("https://mcp.useautumn.com/mcp", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

describe("public MCP discovery", () => {
	test.each(["initialize", "notifications/initialized", "ping", "tools/list"])(
		"allows %s without credentials",
		async (method) => {
			expect(await isPublicMcpDiscoveryRequest(requestFor({ method }))).toBe(
				true,
			);
		},
	);

	test("keeps tool calls behind authentication", async () => {
		expect(
			await isPublicMcpDiscoveryRequest(requestFor({ method: "tools/call" })),
		).toBe(false);
	});

	test("rejects batches containing a protected method", async () => {
		expect(
			await isPublicMcpDiscoveryRequest(
				requestFor([{ method: "tools/list" }, { method: "tools/call" }]),
			),
		).toBe(false);
	});
});
