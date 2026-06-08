import { describe, expect, test } from "bun:test";
import { LEAF_OAUTH_SCOPES } from "@autumn/shared";
import {
	getProtectedResourceMetadata,
	type OAuthHttpError,
} from "../../../src/mcp/auth/protectedResourceMetadata.js";
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
			getProtectedResourceMetadata({ resourceUrl }).scopes_supported,
		).toEqual([...LEAF_OAUTH_SCOPES]);
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

	test("passes OAuth bearer tokens through without local verification", async () => {
		const originalFetch = globalThis.fetch;
		let fetchCalled = false;
		const mockFetch = (async () => {
			fetchCalled = true;
			return Response.json({});
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
				principalId: "oauth:unverified",
				resource: "http://localhost:2718/mcp",
				scopes: [...LEAF_OAUTH_SCOPES],
				serverURL: "http://localhost:8080",
			});
			expect(fetchCalled).toBe(false);
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
		expect(auth.scopes).toEqual([...LEAF_OAUTH_SCOPES]);
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
				resourceUrl: internalResourceUrl,
				serverURL: flags["server-url"],
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
