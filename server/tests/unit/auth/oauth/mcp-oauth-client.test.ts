import { afterEach, describe, expect, test } from "bun:test";
import { isMcpOAuthClient, isMcpOAuthClientRecord } from "@autumn/auth/oauth";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";

const originalInternalMcpClientId = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;

afterEach(() => {
	process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = originalInternalMcpClientId;
});

describe("isMcpOAuthClient", () => {
	test("matches env-configured internal-mcp client ids", () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one, internal_two";

		expect(isMcpOAuthClient({ clientId: "internal_one" })).toBe(true);
		expect(isMcpOAuthClient({ clientId: "internal_two" })).toBe(true);
		expect(isMcpOAuthClient({ clientId: "oauth_client_other" })).toBe(false);
		expect(isMcpOAuthClient({ clientId: null })).toBe(false);
	});
});

describe("isMcpOAuthClientRecord", () => {
	test("matches dynamic clients by mcp_client metadata kind", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: { kind: MCP_CLIENT_KIND },
			}),
		).toBe(true);
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: '{"kind":"mcp_client"}',
			}),
		).toBe(true);
	});

	test("matches the legacy internal_mcp metadata kind", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "oauth_client_abc",
				metadata: { kind: "internal_mcp" },
			}),
		).toBe(true);
	});

	test("does not match reserved or unrelated clients", () => {
		expect(
			isMcpOAuthClientRecord({
				clientId: "autumn_summer",
				metadata: { kind: "summer" },
			}),
		).toBe(false);
		expect(
			isMcpOAuthClientRecord({ clientId: "oauth_client_abc", metadata: null }),
		).toBe(false);
	});

	test("matches the env-configured internal-mcp id without metadata", () => {
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_one";

		expect(isMcpOAuthClientRecord({ clientId: "internal_one" })).toBe(true);
	});
});
