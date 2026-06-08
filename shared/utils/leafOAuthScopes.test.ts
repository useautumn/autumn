import { describe, expect, test } from "bun:test";
import { LEAF_OAUTH_SCOPES } from "./leafOAuthScopes";
import { Scopes } from "./scopeDefinitions";

describe("LEAF_OAUTH_SCOPES", () => {
	test("contains the exact Leaf Slack and MCP OAuth allowlist", () => {
		expect(LEAF_OAUTH_SCOPES).toEqual([
			Scopes.Organisation.Read,
			Scopes.Customers.Read,
			Scopes.Customers.Write,
			Scopes.Features.Read,
			Scopes.Features.Write,
			Scopes.Plans.Read,
			Scopes.Plans.Write,
			Scopes.Balances.Read,
			Scopes.Balances.Write,
			Scopes.Billing.Read,
			Scopes.Billing.Write,
			Scopes.Analytics.Read,
		]);
	});

	test("does not include elevated or unrelated product scopes", () => {
		expect(LEAF_OAUTH_SCOPES).not.toEqual(
			expect.arrayContaining([
				Scopes.Organisation.Write,
				Scopes.ApiKeys.Read,
				Scopes.ApiKeys.Write,
				Scopes.Migrations.Read,
				Scopes.Migrations.Write,
				Scopes.Platform.Read,
				Scopes.Platform.Write,
				Scopes.Rewards.Read,
				Scopes.Rewards.Write,
				Scopes.Admin,
				Scopes.Owner,
				Scopes.Superuser,
			]),
		);
	});
});
