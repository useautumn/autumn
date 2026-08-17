import { describe, expect, test } from "bun:test";
import {
	canonicalizeOAuthResource,
	oauthAudienceAllowsResource,
} from "@autumn/auth/oauth";
import { oauthRefreshToken } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { setupOAuthTokenRequest } from "@/internal/auth/oauth/token/setupOAuthTokenRequest.js";

const resourceUrl = "https://mcp.autumn.dev/mcp";

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

	test("accepts grants minted before audience stamping", () => {
		expect(
			oauthAudienceAllowsResource({ grantResource: null, resourceUrl }),
		).toBe(true);
	});
});

/** Only the refresh-token row is stubbed; the client lookup falls through to null. */
const stubDb = (refreshTokenRow: { resource: string | null } | null) =>
	({
		select: () => ({
			from: (table: unknown) => ({
				where: () => ({
					limit: async () =>
						table === oauthRefreshToken && refreshTokenRow
							? [refreshTokenRow]
							: [],
				}),
			}),
		}),
	}) as unknown as DrizzleCli;

const tokenRequest = ({
	isRefresh,
	resource,
}: {
	isRefresh: boolean;
	resource: string | null;
}) => {
	const body = new URLSearchParams({
		grant_type: isRefresh ? "refresh_token" : "authorization_code",
	});
	if (isRefresh) body.set("refresh_token", "refresh_token_value");
	if (resource) body.set("resource", resource);

	return new Request("https://api.useautumn.com/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body,
	});
};

const setupResource = async ({
	refreshTokenRow,
	resource = null,
}: {
	refreshTokenRow: { resource: string | null } | null;
	resource?: string | null;
}) => {
	const { resource: resolved } = await setupOAuthTokenRequest({
		db: stubDb(refreshTokenRow),
		request: tokenRequest({ isRefresh: refreshTokenRow !== null, resource }),
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
