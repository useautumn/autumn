import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getAutumnEnv } from "@autumn/env";
import { isServedOAuthAudience } from "@/internal/auth/oauth/oauthResourceAudiences.js";

const mcpResourceUrl = "https://mcp.autumn.dev/mcp";
const apiOriginUrl = getAutumnEnv().AUTUMN_API_URL;

const originalMcpResourceUrls = process.env.MCP_RESOURCE_URLS;

beforeAll(() => {
	process.env.MCP_RESOURCE_URLS = mcpResourceUrl;
});

afterAll(() => {
	if (originalMcpResourceUrls === undefined) {
		delete process.env.MCP_RESOURCE_URLS;
		return;
	}
	process.env.MCP_RESOURCE_URLS = originalMcpResourceUrls;
});

describe("isServedOAuthAudience", () => {
	test("accepts a grant stamped for the api origin", () => {
		expect(isServedOAuthAudience({ grantResource: apiOriginUrl })).toBe(true);
	});

	test("accepts a grant stamped for an mcp resource the api fronts", () => {
		expect(isServedOAuthAudience({ grantResource: mcpResourceUrl })).toBe(true);
		expect(
			isServedOAuthAudience({ grantResource: "https://MCP.autumn.dev/mcp/" }),
		).toBe(true);
	});

	test("rejects a grant stamped for an audience this deployment does not serve", () => {
		expect(
			isServedOAuthAudience({ grantResource: "https://evil.example.com/mcp" }),
		).toBe(false);
		expect(
			isServedOAuthAudience({ grantResource: `${apiOriginUrl}/internal` }),
		).toBe(false);
	});

	test("rejects a grant whose stamped resource cannot be canonicalized", () => {
		expect(isServedOAuthAudience({ grantResource: "not a url" })).toBe(false);
	});

	test("accepts a grant whose token request named no resource", () => {
		expect(isServedOAuthAudience({ grantResource: null })).toBe(true);
	});
});
