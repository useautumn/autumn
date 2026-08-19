import { describe, expect, test } from "bun:test";
import {
	getProtectedResourceMetadata,
	UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
} from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { Scopes } from "@autumn/shared/scopeDefinitions";
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

const oauthTokenDb = (row: unknown, consentKind?: string) =>
	({
		query: {
			oauthAccessToken: { findFirst: async () => row },
			oauthConsent: {
				findFirst: async () =>
					consentKind ? { metadata: { kind: consentKind } } : undefined,
			},
		},
	}) as unknown as OAuthAccessTokenDb;

const unusedDb = oauthTokenDb(undefined);

const resourceUrl = "http://localhost:2718/mcp";
const internalResourceUrl = "http://localhost:2718/internal/mcp";

/** Omitting `error` is the RFC 6750 §3.1 challenge for a request with no credentials. */
const expectedChallenge = ({
	error,
	resourcePath,
}: {
	error?: string;
	resourcePath: string;
}) =>
	[
		`Bearer resource_metadata="http://localhost:2718/.well-known/oauth-protected-resource${resourcePath}"`,
		`scope="${DEFAULT_OAUTH_RESOURCE_SCOPES.join(" ")}"`,
		...(error ? [`error="${error}"`] : []),
	].join(", ");

/** The no-credential cases assert an absent code, which toMatchObject cannot see. */
const rejectionFrom = async ({
	flags: requestFlags,
	headers,
}: {
	flags: MCPOAuthFlags;
	headers: Headers;
}) => {
	try {
		await buildAuthForRequest({
			headers,
			db: unusedDb,
			flags: requestFlags,
			logger,
			resourceUrl,
		});
	} catch (error) {
		return error as OAuthHttpError;
	}

	throw new Error("Expected buildAuthForRequest to reject");
};

describe("MCP OAuth auth resolution", () => {
	test("advertises the Leaf OAuth scope allowlist without offline_access", () => {
		expect(
			getProtectedResourceMetadata({
				issuerBaseUrl: flags["server-url"],
				resourceName: "Autumn MCP",
				resourceUrl,
			}).scopes_supported,
		).toEqual([...DEFAULT_OAUTH_RESOURCE_SCOPES]);
	});

	test("challenges a request with no credentials without an error code", async () => {
		const rejection = await rejectionFrom({
			headers: new Headers(),
			flags: flags as MCPOAuthFlags,
		});

		expect(rejection.status).toBe(401);
		expect(rejection.error).toBeUndefined();
		expect(rejection.wwwAuthenticate).toBe(
			expectedChallenge({ resourcePath: "/mcp" }),
		);
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
			wwwAuthenticate: expectedChallenge({ resourcePath: "/internal/mcp" }),
		} satisfies Partial<OAuthHttpError>);
	});

	test("keeps the error code on a challenge for a token that was presented", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({ authorization: "Bearer not_an_autumn_token" }),
				db: unusedDb,
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate: expectedChallenge({
				error: "invalid_token",
				resourcePath: "/mcp",
			}),
		} satisfies Partial<OAuthHttpError>);
	});

	test("validates OAuth bearer tokens and uses the stored identity", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({
				authorization: "Bearer am_oauth_token",
			}),
			db: oauthTokenDb({
				userId: "user_1",
				referenceId: "org_1",
				scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
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
	});

	test("carries the token's granted scopes, not the default set", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({ authorization: "Bearer am_oauth_token" }),
			db: oauthTokenDb({
				userId: "user_1",
				referenceId: "org_1",
				scopes: ["openid", "offline_access", Scopes.Customers.Read],
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.scopes).toEqual([Scopes.Customers.Read]);
	});

	test("steps up a token whose grant names no Autumn resource scopes", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({ authorization: "Bearer am_oauth_token" }),
				db: oauthTokenDb({
					userId: "user_1",
					referenceId: "org_1",
					scopes: ["openid", "profile", "offline_access"],
				}),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 403,
			error: "insufficient_scope",
			wwwAuthenticate: expectedChallenge({
				error: "insufficient_scope",
				resourcePath: "/mcp",
			}),
		} satisfies Partial<OAuthHttpError>);
	});

	test("keeps scope-less unrestricted chat tokens usable", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({ authorization: "Bearer am_oauth_token" }),
			db: oauthTokenDb(
				{
					userId: "user_1",
					referenceId: "org_1",
					oauthConsentId: "oauth_consent_1",
					scopes: [],
				},
				UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
			),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.scopes).toEqual([]);
		expect(auth.orgId).toBe("org_1");
	});

	test("rejects a scope-less token no unrestricted chat consent backs", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({ authorization: "Bearer am_oauth_token" }),
				db: oauthTokenDb(
					{
						userId: "user_1",
						referenceId: "org_1",
						oauthConsentId: "oauth_consent_1",
						scopes: [],
					},
					"slack_admin",
				),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 403,
			error: "insufficient_scope",
		} satisfies Partial<OAuthHttpError>);
	});

	test("rejects a scope-less token with no consent at all", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({ authorization: "Bearer am_oauth_token" }),
				db: oauthTokenDb({
					userId: "user_1",
					referenceId: "org_1",
					oauthConsentId: null,
					scopes: [],
				}),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 403,
			error: "insufficient_scope",
		} satisfies Partial<OAuthHttpError>);
	});

	test("accepts a token stamped with this resource, ignoring canonical noise", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({ authorization: "Bearer am_oauth_token" }),
			db: oauthTokenDb({
				userId: "user_1",
				referenceId: "org_1",
				resource: "HTTP://LocalHost:2718/mcp/",
				scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.orgId).toBe("org_1");
	});

	test("challenges a token stamped for another MCP resource", async () => {
		await expect(
			buildAuthForRequest({
				headers: new Headers({ authorization: "Bearer am_oauth_token" }),
				db: oauthTokenDb({
					userId: "user_1",
					referenceId: "org_1",
					resource: internalResourceUrl,
					scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
				}),
				flags: flags as MCPOAuthFlags,
				logger,
				resourceUrl,
			}),
		).rejects.toMatchObject({
			status: 401,
			error: "invalid_token",
			wwwAuthenticate: expectedChallenge({
				error: "invalid_token",
				resourcePath: "/mcp",
			}),
		} satisfies Partial<OAuthHttpError>);
	});

	test("accepts a token whose request named no resource", async () => {
		const auth = await buildAuthForRequest({
			headers: new Headers({ authorization: "Bearer am_oauth_token" }),
			db: oauthTokenDb({
				userId: "user_1",
				referenceId: "org_1",
				resource: null,
				scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			}),
			flags: flags as MCPOAuthFlags,
			logger,
			resourceUrl,
		});

		expect(auth.orgId).toBe("org_1");
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
			wwwAuthenticate: expectedChallenge({
				error: "invalid_token",
				resourcePath: "/mcp",
			}),
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

	test("missing static secret-key returns no error code either", async () => {
		const rejection = await rejectionFrom({
			headers: new Headers(),
			flags: { ...flags, "oauth-enabled": false } as MCPOAuthFlags,
		});

		expect(rejection.status).toBe(401);
		expect(rejection.error).toBeUndefined();
		expect(rejection.wwwAuthenticate).toBeUndefined();
	});
});
