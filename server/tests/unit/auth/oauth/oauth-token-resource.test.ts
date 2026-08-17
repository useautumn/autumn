import { describe, expect, test } from "bun:test";
import {
	canonicalizeOAuthResource,
	oauthAudienceAllowsResource,
} from "@autumn/auth/oauth";
import { resolveOAuthTokenResource } from "@/internal/auth/oauth/token/resolveOAuthTokenResource.js";

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

describe("resolveOAuthTokenResource", () => {
	test("canonicalizes the resource an initial grant requested", () => {
		expect(
			resolveOAuthTokenResource({
				refreshTokenRecord: null,
				requestResource: "https://MCP.autumn.dev/mcp/",
			}),
		).toBe(resourceUrl);
	});

	test("keeps the refresh chain's audience when the client omits resource", () => {
		expect(
			resolveOAuthTokenResource({
				refreshTokenRecord: { resource: resourceUrl },
				requestResource: null,
			}),
		).toBe(resourceUrl);
	});

	test("does not let a refresh request retarget the granted audience", () => {
		expect(
			resolveOAuthTokenResource({
				refreshTokenRecord: { resource: resourceUrl },
				requestResource: "https://evil.example.com/mcp",
			}),
		).toBe(resourceUrl);
	});

	test("stamps a legacy refresh chain from the request's resource", () => {
		expect(
			resolveOAuthTokenResource({
				refreshTokenRecord: { resource: null },
				requestResource: resourceUrl,
			}),
		).toBe(resourceUrl);
	});

	test("leaves the grant unstamped when no resource is known", () => {
		expect(
			resolveOAuthTokenResource({
				refreshTokenRecord: { resource: null },
				requestResource: null,
			}),
		).toBeNull();
	});
});
