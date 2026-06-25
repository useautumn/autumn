import { describe, expect, test } from "bun:test";
import {
	getOAuthResourcesForScopes,
	getSelectableOAuthResourceScopes,
	isOAuthProtocolScope,
	isOAuthResourceScope,
} from "./oauthScopeUtils";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "./autumnOAuthScopes";
import { Scopes } from "../scopeDefinitions";

describe("oauthScopeUtils", () => {
	test("defaults selectable resource scopes when only protocol scopes are requested", () => {
		expect(getSelectableOAuthResourceScopes(["openid", "offline_access"])).toEqual(
			DEFAULT_OAUTH_RESOURCE_SCOPES,
		);
	});

	test("keeps non-default modern resource scopes selectable", () => {
		expect(
			getSelectableOAuthResourceScopes([
				Scopes.Customers.Read,
				Scopes.Migrations.Write,
				"offline_access",
				"invalid",
			]),
		).toEqual([Scopes.Customers.Read, Scopes.Migrations.Write]);
	});

	test("classifies protocol and resource scopes separately", () => {
		expect(isOAuthProtocolScope("offline_access")).toBe(true);
		expect(isOAuthResourceScope(Scopes.Migrations.Write)).toBe(true);
		expect(isOAuthResourceScope("superuser")).toBe(false);
	});

	test("derives resources from selected scopes", () => {
		expect(
			getOAuthResourcesForScopes([
				Scopes.Customers.Read,
				Scopes.Customers.Write,
				Scopes.Migrations.Write,
			]),
		).toEqual(["customers", "migrations"]);
	});
});
