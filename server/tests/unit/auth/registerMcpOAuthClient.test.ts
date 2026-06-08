import { describe, expect, test } from "bun:test";
import { getLeafMcpOAuthScopes } from "@autumn/auth/oauth";
import { LEAF_OAUTH_SCOPES } from "@autumn/shared";
import { Scopes } from "@autumn/shared/scopeDefinitions";
import { getRequestedScopesForMcpClient } from "@/internal/auth/actions/registerMcpOAuthClient.js";

describe("getRequestedScopesForMcpClient", () => {
	test("defaults Slack MCP clients to Leaf OAuth scopes", () => {
		expect(
			getRequestedScopesForMcpClient({ clientType: "slack", scope: undefined }),
		).toEqual([...LEAF_OAUTH_SCOPES]);
	});

	test("defaults Codex MCP clients to Leaf OAuth scopes", () => {
		expect(
			getRequestedScopesForMcpClient({ clientType: "codex", scope: undefined }),
		).toEqual([...LEAF_OAUTH_SCOPES]);
	});

	test("defaults dynamic MCP clients to Leaf OAuth scopes", () => {
		expect(
			getRequestedScopesForMcpClient({
				clientType: "dynamic",
				scope: undefined,
			}),
		).toEqual([...LEAF_OAUTH_SCOPES]);
	});

	test("caps explicit requested scopes to Leaf scopes", () => {
		expect(
			getRequestedScopesForMcpClient({
				clientType: "slack",
				scope: `${Scopes.Customers.Read} ${Scopes.Plans.Write} ${Scopes.ApiKeys.Write} invalid`,
			}),
		).toEqual([Scopes.Customers.Read, Scopes.Plans.Write]);
	});

	test("caps OAuth grants to Leaf scopes", () => {
		expect(
			getLeafMcpOAuthScopes([
				Scopes.Customers.Read,
				Scopes.ApiKeys.Write,
				Scopes.Analytics.Read,
			]),
		).toEqual([Scopes.Customers.Read, Scopes.Analytics.Read]);
	});
});
