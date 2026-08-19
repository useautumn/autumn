import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	canonicalizeOAuthResource,
	oauthAudienceAllowsResource,
} from "@autumn/auth/oauth";
import { getAutumnEnv } from "@autumn/env";
import { oauthClient, oauthRefreshToken } from "@autumn/shared";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthTokenErrorResponse } from "@/internal/auth/oauth/token/oauthTokenErrorResponse.js";
import { OAuthTokenResourceError } from "@/internal/auth/oauth/token/resolveOAuthTokenResource.js";
import { setupOAuthTokenRequest } from "@/internal/auth/oauth/token/setupOAuthTokenRequest.js";

const resourceUrl = "https://mcp.autumn.dev/mcp";
const apiOriginUrl = getAutumnEnv().AUTUMN_API_URL;
const mcpClientId = "oauth_client_mcp";

const originalMcpResourceUrls = process.env.MCP_RESOURCE_URLS;

beforeAll(() => {
	process.env.MCP_RESOURCE_URLS = resourceUrl;
});

afterAll(() => {
	if (originalMcpResourceUrls === undefined) {
		delete process.env.MCP_RESOURCE_URLS;
		return;
	}
	process.env.MCP_RESOURCE_URLS = originalMcpResourceUrls;
});

describe("canonicalizeOAuthResource", () => {
	test("lowercases scheme and host, drops the default port and trailing slash", () => {
		expect(canonicalizeOAuthResource("HTTPS://MCP.Autumn.Dev:443/mcp/")).toBe(
			resourceUrl,
		);
	});

	test("keeps the path case, a non-default port and the query", () => {
		expect(
			canonicalizeOAuthResource("https://mcp.autumn.dev:8443/MCP?a=b"),
		).toBe("https://mcp.autumn.dev:8443/MCP?a=b");
	});

	test("rejects values that are not http(s) resource identifiers", () => {
		expect(canonicalizeOAuthResource("mcp.autumn.dev/mcp")).toBeNull();
		expect(canonicalizeOAuthResource("urn:autumn:mcp")).toBeNull();
		expect(canonicalizeOAuthResource(null)).toBeNull();
	});
});

describe("oauthAudienceAllowsResource", () => {
	test("accepts a grant stamped for the same canonical resource", () => {
		expect(
			oauthAudienceAllowsResource({
				grantResource: "https://MCP.autumn.dev/mcp/",
				resourceUrl,
			}),
		).toBe(true);
	});

	test("rejects a grant stamped for a different host or path", () => {
		expect(
			oauthAudienceAllowsResource({
				grantResource: "https://mcp.autumn.dev/internal/mcp",
				resourceUrl,
			}),
		).toBe(false);
		expect(
			oauthAudienceAllowsResource({
				grantResource: "https://evil.example.com/mcp",
				resourceUrl,
			}),
		).toBe(false);
	});

	test("rejects a grant whose stamped resource cannot be canonicalized", () => {
		expect(
			oauthAudienceAllowsResource({ grantResource: "not a url", resourceUrl }),
		).toBe(false);
	});

	test("accepts a grant whose token request named no resource", () => {
		expect(
			oauthAudienceAllowsResource({ grantResource: null, resourceUrl }),
		).toBe(true);
	});
});

type RefreshTokenRow = { clientId?: string; resource: string | null };

/** Rows the two lookups behind a token request read: the refresh grant and the client. */
const stubDb = ({
	isMcpClient,
	refreshTokenRow,
}: {
	isMcpClient: boolean;
	refreshTokenRow: RefreshTokenRow | null;
}) =>
	({
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: async () => {
						if (table === oauthRefreshToken) {
							return refreshTokenRow ? [refreshTokenRow] : [];
						}
						if (table === oauthClient && isMcpClient) {
							return [
								{ clientId: mcpClientId, metadata: { kind: MCP_CLIENT_KIND } },
							];
						}
						return [];
					},
				}),
			}),
		}),
	}) as unknown as DrizzleCli;

const tokenRequest = ({
	clientId,
	isRefresh,
	resource,
}: {
	clientId: string | null;
	isRefresh: boolean;
	resource: string | null;
}) => {
	const body = new URLSearchParams({
		grant_type: isRefresh ? "refresh_token" : "authorization_code",
	});
	if (isRefresh) body.set("refresh_token", "refresh_token_value");
	if (clientId) body.set("client_id", clientId);
	if (resource) body.set("resource", resource);

	return new Request("https://api.useautumn.com/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body,
	});
};

const setupResource = async ({
	isMcpClient = false,
	refreshTokenRow,
	resource = null,
}: {
	isMcpClient?: boolean;
	refreshTokenRow: RefreshTokenRow | null;
	resource?: string | null;
}) => {
	const { resource: resolved } = await setupOAuthTokenRequest({
		db: stubDb({ isMcpClient, refreshTokenRow }),
		request: tokenRequest({
			clientId: isMcpClient ? mcpClientId : null,
			isRefresh: refreshTokenRow !== null,
			resource,
		}),
	});
	return resolved;
};

describe("setupOAuthTokenRequest resource resolution", () => {
	test("canonicalizes the resource an initial grant requested", async () => {
		expect(
			await setupResource({
				refreshTokenRow: null,
				resource: "https://MCP.autumn.dev/mcp/",
			}),
		).toBe(resourceUrl);
	});

	test("keeps the refresh chain's audience when the client omits resource", async () => {
		expect(
			await setupResource({ refreshTokenRow: { resource: resourceUrl } }),
		).toBe(resourceUrl);
	});

	test("does not let a refresh request retarget the granted audience", async () => {
		expect(
			await setupResource({
				refreshTokenRow: { resource: resourceUrl },
				resource: "https://evil.example.com/mcp",
			}),
		).toBe(resourceUrl);
	});

	test("stamps a legacy refresh chain from the request's resource", async () => {
		expect(
			await setupResource({
				refreshTokenRow: { resource: null },
				resource: resourceUrl,
			}),
		).toBe(resourceUrl);
	});

	test("leaves the grant unstamped when no resource is known", async () => {
		expect(
			await setupResource({ refreshTokenRow: { resource: null } }),
		).toBeNull();
	});
});

describe("setupOAuthTokenRequest resource validation", () => {
	test("refuses a resource this server does not serve", async () => {
		await expect(
			setupResource({
				refreshTokenRow: null,
				resource: "https://evil.example.com/api",
			}),
		).rejects.toBeInstanceOf(OAuthTokenResourceError);
	});

	test("refuses a resource that is not an http(s) identifier", async () => {
		await expect(
			setupResource({ refreshTokenRow: null, resource: "urn:autumn:mcp" }),
		).rejects.toBeInstanceOf(OAuthTokenResourceError);
	});

	test("serves the api origin to clients that are not mcp clients", async () => {
		expect(
			await setupResource({ refreshTokenRow: null, resource: apiOriginUrl }),
		).toBe(canonicalizeOAuthResource(apiOriginUrl));
	});

	test("refuses an mcp client's grant aimed at the api origin", async () => {
		await expect(
			setupResource({
				isMcpClient: true,
				refreshTokenRow: null,
				resource: apiOriginUrl,
			}),
		).rejects.toBeInstanceOf(OAuthTokenResourceError);
	});

	test("serves an mcp resource url to an mcp client", async () => {
		expect(
			await setupResource({
				isMcpClient: true,
				refreshTokenRow: null,
				resource: resourceUrl,
			}),
		).toBe(resourceUrl);
	});

	test("refuses an unserved resource a legacy refresh chain would adopt", async () => {
		await expect(
			setupResource({
				refreshTokenRow: { resource: null },
				resource: "https://evil.example.com/api",
			}),
		).rejects.toBeInstanceOf(OAuthTokenResourceError);
	});
});

describe("oauthTokenErrorResponse for an unserved resource", () => {
	test("answers with an RFC 8707 invalid_target error body", async () => {
		const response = oauthTokenErrorResponse({
			error: new OAuthTokenResourceError("no tokens for that resource"),
		});

		expect(response?.status).toBe(400);
		expect(await response?.json()).toEqual({
			error: "invalid_target",
			error_description: "no tokens for that resource",
		});
	});
});
