import { describe, expect, test } from "bun:test";
import { getProtectedResourceMetadata } from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import type { OAuthHttpError } from "../../../src/mcp/auth/protectedResourceMetadata.js";
import {
	buildAuthForRequest,
	type MCPOAuthFlags,
} from "../../../src/mcp/auth/resolveRequestAuth.js";

const flags = {
	"oauth-enabled": true,
	"oauth-environment": "sandbox",
	"server-url": "http://localhost:8080",
} satisfies Partial<MCPOAuthFlags>;

const logger = {
	warning: () => {},
} as never;

const resourceUrl = "http://localhost:2718/mcp";
const internalResourceUrl = "http://localhost:2718/internal/mcp";

describe("MCP OAuth auth resolution", () => {
	test("advertises the Leaf OAuth scope allowlist", () => {
		expect(
			getProtectedResourceMetadata({
				issuerBaseUrl: flags["server-url"],
				resourceName: "Autumn MCP",
				resourceUrl,
			}).scopes_supported,
		).toEqual([...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"]);
	});

	test("returns a WWW-Authenticate challenge without a bearer token", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers(),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/mcp", error="invalid_token"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("returns an internal MCP resource challenge", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers(),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl: internalResourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate:
				'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/internal/mcp", error="invalid_token"',
		} satisfies Partial<OAuthHttpError>);
	});

	test("validates OAuth bearer tokens and uses the resolved identity", async () => {
		const originalFetch = globalThis.fetch;
		let validationRequest: Request | undefined;
		const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			validationRequest = new Request(input, init);
			return Response.json({ id: "org_1", user: { id: "user_1" } });
		}) as unknown as typeof fetch;
		globalThis.fetch = mockFetch;

		try {
			const auth = await buildAuthForRequest({
				headers: new Headers({
					authorization: "Bearer am_oauth_token",
				}),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			});

			expect(auth).toMatchObject({
				apiKey: "am_oauth_token",
				authMethod: "oauth",
				env: "sandbox",
				orgId: "org_1",
				resource: "http://localhost:2718/mcp",
				scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
				serverURL: "http://localhost:8080",
			});
			expect(auth.principalId).toStartWith("oauth:");
			expect(validationRequest?.url).toBe(
				"http://localhost:8080/v1/organization/me",
			);
			expect(validationRequest?.method).toBe("GET");
			expect(validationRequest?.headers.get("authorization")).toBe(
				"Bearer am_oauth_token",
			);
			expect(validationRequest?.headers.get("x-autumn-oauth-resource")).toBe(
				resourceUrl,
			);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("challenges expired OAuth bearer tokens at the MCP boundary", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			Response.json(
				{
					code: "invalid_request",
					message: "Invalid or expired access token",
				},
				{ status: 401 },
			)) as unknown as typeof fetch;

		try {
			await expect(
				buildAuthForRequest({
					headers: new Headers({
						authorization: "Bearer am_oauth_expired",
					}),
					flags: flags as MCPOAuthFlags,
					logger,
					resourceUrl,
				}),
			).rejects.toMatchObject({
				status: 401,
				error: "invalid_token",
				wwwAuthenticate:
					'Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource/mcp", error="invalid_token"',
			} satisfies Partial<OAuthHttpError>);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("does not misreport validation service failures as invalid tokens", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			Response.json(
				{ error: "unavailable" },
				{ status: 503 },
			)) as unknown as typeof fetch;

		try {
			await expect(
				buildAuthForRequest({
					headers: new Headers({
						authorization: "Bearer am_oauth_token",
					}),
					flags: flags as MCPOAuthFlags,
					logger,
					resourceUrl,
				}),
			).rejects.toThrow("Autumn OAuth token validation failed (503)");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("accepts a static secret-key when OAuth is enabled", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				"secret-key": "am_sk_test_chat",
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.apiKey).toBe("am_sk_test_chat");
		expect(auth.principalId).toStartWith("secret-key:");
		expect(auth.resource).toBe("http://localhost:2718/mcp");
		expect(auth.scopes).toEqual([...DEFAULT_OAUTH_RESOURCE_SCOPES]);
	});

	test("accepts an Autumn API key bearer token when OAuth is enabled", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				authorization: "Bearer am_sk_test_chat",
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.apiKey).toBe("am_sk_test_chat");
		expect(auth.principalId).toStartWith("secret-key:");
	});

	test("uses route-specific resource URLs", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				authorization: "Bearer am_sk_test_chat",
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl: internalResourceUrl,
		});

		expect(auth.resource).toBe("http://localhost:2718/internal/mcp");
		expect(
			getProtectedResourceMetadata({
				issuerBaseUrl: flags["server-url"],
				resourceName: "Autumn MCP",
				resourceUrl: internalResourceUrl,
			}).resource,
		).toBe("http://localhost:2718/internal/mcp");
	});

	test("missing static secret-key returns the auth error path", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers(),
				flags: {
					...flags,
					"oauth-enabled": false,
				} as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
		} satisfies Partial<OAuthHttpError>);
	});
});
