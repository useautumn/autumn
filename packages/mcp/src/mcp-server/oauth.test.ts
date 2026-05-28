import { describe, expect, test } from "bun:test";
import {
	buildAuthForRequest,
	getProtectedResourceMetadata,
	MCP_OAUTH_SCOPES,
	OAuthHttpError,
	type MCPOAuthFlags,
} from "./oauth.js";

const flags = {
	"disable-static-auth": true,
	"oauth-enabled": true,
	"oauth-environment": "sandbox",
	"oauth-issuer-url": "http://localhost:8080/api/auth",
	"oauth-resource-url": "http://localhost:2718/mcp",
	"server-url": "http://localhost:8080",
} satisfies Partial<MCPOAuthFlags>;

const logger = {
	warning: () => {},
} as never;

describe("MCP OAuth auth resolution", () => {
	test("returns a WWW-Authenticate challenge without a bearer token", async () => {
		await expect(
			buildAuthForRequest(new Headers(), flags as MCPOAuthFlags, logger),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/mcp"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("returns an internal MCP resource challenge", async () => {
		await expect(
			buildAuthForRequest(
				new Headers(),
				flags as MCPOAuthFlags,
				logger,
				"/internal/mcp",
			),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/internal/mcp"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("exchanges a bearer token for Autumn API credentials", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_url, init) => {
			expect(init?.headers).toEqual({
				Authorization: "Bearer oauth_token",
				"Content-Type": "application/json",
			});
			expect(JSON.parse(init?.body as string)).toEqual({
				resource: "http://localhost:2718/mcp",
				scopes: MCP_OAUTH_SCOPES,
			});
			return Response.json({
				sandbox_key: "sk_sandbox",
				prod_key: "sk_live",
				org_id: "org_123",
				user_id: "user_123",
				client_id: "client_123",
				scopes: MCP_OAUTH_SCOPES,
			});
		}) as typeof fetch;

		try {
			const auth = await buildAuthForRequest(
				new Headers({ authorization: "Bearer oauth_token" }),
				flags as MCPOAuthFlags,
				logger,
			);

			expect(auth.apiKey).toBe("sk_sandbox");
			expect(auth.env).toBe("sandbox");
			expect(auth.resource).toBe("http://localhost:2718/mcp");
			expect(auth.principalId).toBe("oauth:org_123:user_123:client_123");
			expect(auth.scopes).toEqual([...MCP_OAUTH_SCOPES]);
			expect(auth.orgId).toBe("org_123");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("uses route-specific resource URLs", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (_url, init) => {
			expect(JSON.parse(init?.body as string)).toMatchObject({
				resource: "http://localhost:2718/internal/mcp",
			});
			return Response.json({
				sandbox_key: "sk_sandbox",
				org_id: "org_123",
				scopes: MCP_OAUTH_SCOPES,
			});
		}) as typeof fetch;

		try {
			const auth = await buildAuthForRequest(
				new Headers({ authorization: "Bearer internal_oauth_token" }),
				flags as MCPOAuthFlags,
				logger,
				"/internal/mcp",
			);

			expect(auth.resource).toBe("http://localhost:2718/internal/mcp");
			expect(
				getProtectedResourceMetadata(
					new Headers(),
					flags as MCPOAuthFlags,
					"/internal/mcp",
				).resource,
			).toBe("http://localhost:2718/internal/mcp");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("missing static secret-key returns the auth error path", async () => {
		await expect(
			buildAuthForRequest(
				new Headers(),
				{
					...flags,
					"disable-static-auth": false,
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
