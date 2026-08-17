import { afterEach, describe, expect, test } from "bun:test";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	isReservedOAuthClientId,
	isReservedOAuthClientName,
	SLACK_MCP_OAUTH_CLIENT_ID,
	SUMMER_OAUTH_CLIENT_ID,
	WEB_MCP_OAUTH_CLIENT_ID,
} from "@autumn/auth/oauth";

const originalAtmnClientIds = process.env.ATMN_OAUTH_CLIENT_IDS;
const originalInternalMcpClientId = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;

afterEach(() => {
	process.env.ATMN_OAUTH_CLIENT_IDS = originalAtmnClientIds;
	process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = originalInternalMcpClientId;
});

describe("isReservedOAuthClientId", () => {
	test("covers the static first-party client ids", () => {
		for (const clientId of [
			AUTUMN_ADMIN_OAUTH_CLIENT_ID,
			SUMMER_OAUTH_CLIENT_ID,
			SLACK_MCP_OAUTH_CLIENT_ID,
			WEB_MCP_OAUTH_CLIENT_ID,
		]) {
			expect(isReservedOAuthClientId(clientId)).toBe(true);
		}
	});

	test("covers env-configured atmn and internal-mcp client ids", () => {
		process.env.ATMN_OAUTH_CLIENT_IDS = "atmn_one, atmn_two";
		process.env.INTERNAL_MCP_OAUTH_CLIENT_ID = "internal_mcp_one";

		expect(isReservedOAuthClientId("atmn_one")).toBe(true);
		expect(isReservedOAuthClientId("atmn_two")).toBe(true);
		expect(isReservedOAuthClientId("internal_mcp_one")).toBe(true);
	});

	test("does not reserve dynamically generated client ids", () => {
		expect(isReservedOAuthClientId("oauth_client_2abcDEF")).toBe(false);
		expect(isReservedOAuthClientId("autumn_mcp_cursor")).toBe(false);
	});
});

describe("isReservedOAuthClientName", () => {
	test("matches the denylist case- and whitespace-insensitively", () => {
		expect(isReservedOAuthClientName("ATMN")).toBe(true);
		expect(isReservedOAuthClientName("  Autumn CLI ")).toBe(true);
		expect(isReservedOAuthClientName("Autumn internal-mcp")).toBe(true);
		expect(isReservedOAuthClientName("Summer")).toBe(true);
	});

	test("allows ordinary client names", () => {
		expect(isReservedOAuthClientName("Cursor")).toBe(false);
		expect(isReservedOAuthClientName("Summerly")).toBe(false);
		expect(isReservedOAuthClientName("MCP client")).toBe(false);
	});
});
