import { describe, expect, test } from "bun:test";
import { getProtectedResourceMetadata } from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import type { OAuthAccessTokenDb } from "@autumn/shared/utils/auth/oauthAccessTokens";
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

const oauthTokenDb = (row: unknown) =>
	({
		query: { oauthAccessToken: { findFirst: async () => row } },
	}) as unknown as OAuthAccessTokenDb;

const unusedDb = oauthTokenDb(undefined);

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
				db: unusedDb,
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
				db: unusedDb,
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

	test("validates OAuth bearer tokens and uses the stored identity", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				authorization: "Bearer am_oauth_token",
			}),
			db: oauthTokenDb({ userId: "user_1", referenceId: "org_1" }),
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
	});

	test("challenges expired or unknown OAuth bearer tokens at the MCP boundary", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({
					authorization: "Bearer am_oauth_expired",
				}),
				db: oauthTokenDb(undefined),
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

	test("challenges OAuth tokens missing a user or organization", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({
					authorization: "Bearer am_oauth_token",
				}),
				db: oauthTokenDb({ userId: null, referenceId: "org_1" }),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
		} satisfies Partial<OAuthHttpError>);
	});

	test("does not misreport token store failures as invalid tokens", async () => {
		const db = {
			query: {
				oauthAccessToken: {
					findFirst: async () => {
						throw new Error("database unavailable");
					},
				},
			},
		} as unknown as OAuthAccessTokenDb;

		await expect(
			buildAuthForRequest({
				headers: new Headers({
					authorization: "Bearer am_oauth_token",
				}),
				db,
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toThrow("database unavailable");
	});

	test("accepts a static secret-key when OAuth is enabled", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				"secret-key": "am_sk_test_chat",
			}),
			db: unusedDb,
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
			db: unusedDb,
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
			db: unusedDb,
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
				db: unusedDb,
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
