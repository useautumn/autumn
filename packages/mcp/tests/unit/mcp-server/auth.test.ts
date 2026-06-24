import { describe, expect, test } from "bun:test";
import { createAutumnClient } from "../../../src/server/auth/auth.js";
import type { AutumnMcpAuth } from "../../../src/server/auth/auth.js";

const baseAuth: AutumnMcpAuth = {
	apiKey: "am_sk_test",
	env: "sandbox",
	principalId: "test-user",
	resource: "https://mcp.useautumn.com/mcp",
	scopes: ["customers:read"],
	serverURL: "http://localhost:8080",
};

describe("Autumn MCP auth client", () => {
	test("omits environment for secret-key API calls", () => {
		const headers = new Headers(
			createAutumnClient({
				...baseAuth,
				authMethod: "secret-key",
			}).headers as HeadersInit,
		);

		expect(headers.get("x-autumn-environment")).toBeNull();
		expect(headers.get("x-autumn-oauth-resource")).toBeNull();
	});

	test("omits environment for OAuth API calls", () => {
		const headers = new Headers(
			createAutumnClient({
				...baseAuth,
				apiKey: "am_oauth_test",
				authMethod: "oauth",
			}).headers as HeadersInit,
		);

		expect(headers.get("x-autumn-environment")).toBeNull();
		expect(headers.get("x-autumn-oauth-resource")).toBe(
			"https://mcp.useautumn.com/mcp",
		);
	});
});
