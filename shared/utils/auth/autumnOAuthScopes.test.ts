import { describe, expect, test } from "bun:test";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "./autumnOAuthScopes";
import { Scopes } from "../scopeDefinitions";

describe("DEFAULT_OAUTH_RESOURCE_SCOPES", () => {
	test("contains the exact Autumn OAuth resource allowlist", () => {
		expect(DEFAULT_OAUTH_RESOURCE_SCOPES).toEqual([
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
		expect(DEFAULT_OAUTH_RESOURCE_SCOPES).not.toEqual(
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
