import { describe, expect, test } from "bun:test";
import { Scopes } from "@autumn/shared/scopeDefinitions";
import {
	buildAuthForRequest,
	getProtectedResourceMetadata,
	MCP_OAUTH_SCOPES,
	type MCPOAuthFlags,
	type OAuthHttpError,
} from "../../../src/server/auth/oauth.js";

const flags = {
	"oauth-enabled": true,
	"oauth-environment": "sandbox",
	"server-url": "http://localhost:8080",
} satisfies Partial<MCPOAuthFlags>;

const logger = {
	warning: () => {},
} as never;

describe("MCP OAuth auth resolution", () => {
	test("requests scopes required by public write tools", () => {
		expect(MCP_OAUTH_SCOPES).toEqual(
			expect.arrayContaining([
				Scopes.Customers.Write,
				Scopes.Plans.Write,
				Scopes.Billing.Write,
				Scopes.Balances.Write,
			]),
		);
	});

	test("returns a WWW-Authenticate challenge without a bearer token", async () => {
		await expect(
			buildAuthForRequest(
				new Headers({ host: "localhost:2718" }),
				flags as MCPOAuthFlags,
				logger,
			),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/mcp", error="invalid_token"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("returns an internal MCP resource challenge", async () => {
		await expect(
			buildAuthForRequest(
				new Headers({ host: "localhost:2718" }),
				flags as MCPOAuthFlags,
				logger,
				"/internal/mcp",
			),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/internal/mcp", error="invalid_token"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("rejects opaque bearer tokens without exchanging them", async () => {
		const originalFetch = globalThis.fetch;
		let fetchCalled = false;
		const mockFetch = (async () => {
			fetchCalled = true;
			return Response.json({});
		}) as unknown as typeof fetch;
		globalThis.fetch = mockFetch;

		try {
			await expect(
				buildAuthForRequest(
					new Headers({
						authorization: "Bearer oauth_token",
						host: "localhost:2718",
					}),
					flags as MCPOAuthFlags,
					logger,
				),
			).rejects.toMatchObject({
				status: 401,
				error: "invalid_token",
			} satisfies Partial<OAuthHttpError>);
			expect(fetchCalled).toBe(false);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("accepts a static secret-key when OAuth is enabled", async () => {
		const auth = await buildAuthForRequest(
			new Headers({
				host: "localhost:2718",
				"secret-key": "am_sk_test_chat",
			}),
			flags as MCPOAuthFlags,
			logger,
		);

		expect(auth.apiKey).toBe("am_sk_test_chat");
		expect(auth.principalId).toStartWith("secret-key:");
		expect(auth.resource).toBe("http://localhost:2718/mcp");
	});

	test("accepts an Autumn API key bearer token when OAuth is enabled", async () => {
		const auth = await buildAuthForRequest(
			new Headers({
				authorization: "Bearer am_sk_test_chat",
				host: "localhost:2718",
			}),
			flags as MCPOAuthFlags,
			logger,
		);

		expect(auth.apiKey).toBe("am_sk_test_chat");
		expect(auth.principalId).toStartWith("secret-key:");
	});

	test("uses route-specific resource URLs", async () => {
		const auth = await buildAuthForRequest(
			new Headers({
				authorization: "Bearer am_sk_test_chat",
				host: "localhost:2718",
			}),
			flags as MCPOAuthFlags,
			logger,
			"/internal/mcp",
		);

		expect(auth.resource).toBe("http://localhost:2718/internal/mcp");
		expect(
			getProtectedResourceMetadata(
				new Headers({ host: "localhost:2718" }),
				flags as MCPOAuthFlags,
				"/internal/mcp",
			).resource,
		).toBe("http://localhost:2718/internal/mcp");
	});

	test("missing static secret-key returns the auth error path", async () => {
		await expect(
			buildAuthForRequest(
				new Headers({ host: "localhost:2718" }),
				{
					...flags,
					"oauth-enabled": false,
				} as MCPOAuthFlags,
				logger,
			),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
		} satisfies Partial<OAuthHttpError>);
	});
});
