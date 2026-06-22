import { describe, expect, test } from "bun:test";
import {
	getDefaultOAuthScopes,
	getOAuthResourceScopes,
} from "@autumn/auth/oauth";
import { LEAF_OAUTH_SCOPES } from "@autumn/shared";
import { Scopes } from "@autumn/shared/scopeDefinitions";
import { getRequestedScopesForMcpClient } from "@/internal/auth/actions/registerMcpOAuthClient.js";

const OFFLINE_ACCESS_SCOPE = "offline_access";
const DEFAULT_MCP_SCOPES = [...LEAF_OAUTH_SCOPES, OFFLINE_ACCESS_SCOPE];

describe("getRequestedScopesForMcpClient", () => {
	test("defaults Slack MCP clients to Leaf scopes plus offline access", () => {
		expect(
			getRequestedScopesForMcpClient({ clientType: "slack", scope: undefined }),
		).toEqual(DEFAULT_MCP_SCOPES);
	});

	test("defaults Codex MCP clients to Leaf scopes plus offline access", () => {
		expect(
			getRequestedScopesForMcpClient({ clientType: "codex", scope: undefined }),
		).toEqual(DEFAULT_MCP_SCOPES);
	});

	test("defaults dynamic MCP clients to Leaf scopes plus offline access", () => {
		expect(
			getRequestedScopesForMcpClient({
				clientType: "dynamic",
				scope: undefined,
			}),
		).toEqual(DEFAULT_MCP_SCOPES);
	});

	test("caps explicit requested scopes to Leaf scopes plus offline access", () => {
		expect(
			getRequestedScopesForMcpClient({
				clientType: "slack",
				scope: `${Scopes.Customers.Read} ${Scopes.Plans.Write} ${Scopes.ApiKeys.Write} ${OFFLINE_ACCESS_SCOPE} invalid`,
			}),
		).toEqual([
			Scopes.Customers.Read,
			Scopes.Plans.Write,
			OFFLINE_ACCESS_SCOPE,
		]);
	});

	test("preserves offline access in default OAuth scopes", () => {
		expect(getDefaultOAuthScopes()).toEqual(DEFAULT_MCP_SCOPES);
	});

	test("caps OAuth grants to Leaf scopes plus offline access", () => {
		expect(
			getDefaultOAuthScopes([
				Scopes.Customers.Read,
				Scopes.ApiKeys.Write,
				Scopes.Analytics.Read,
				OFFLINE_ACCESS_SCOPE,
			]),
		).toEqual([
			Scopes.Customers.Read,
			Scopes.Analytics.Read,
			OFFLINE_ACCESS_SCOPE,
		]);
	});

	test("keeps legacy CRUDL scopes (old CLI) whose alias is leaf-allowed, verbatim", () => {
		expect(
			getDefaultOAuthScopes([
				"customers:create",
				"customers:read",
				"customers:list",
				"customers:update",
				"customers:delete",
				"features:create",
				"features:read",
				"plans:update",
				"apiKeys:create",
				"organisation:read",
			]),
		).toEqual([
			"customers:create",
			"customers:read",
			"customers:list",
			"customers:update",
			"customers:delete",
			"features:create",
			"features:read",
			"plans:update",
			"organisation:read",
		]);
	});

	test("strips OAuth protocol scopes from resource scopes", () => {
		expect(
			getOAuthResourceScopes([
				Scopes.Customers.Read,
				OFFLINE_ACCESS_SCOPE,
				"openid",
				"profile",
				"email",
				Scopes.Analytics.Read,
			]),
		).toEqual([Scopes.Customers.Read, Scopes.Analytics.Read]);
	});
});
