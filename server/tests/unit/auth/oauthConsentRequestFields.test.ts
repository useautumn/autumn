import { describe, expect, test } from "bun:test";
import { getOAuthConsentRequestedScopesFromFields } from "@/internal/auth/oauth/handleOAuthConsentWithEnv.js";
import { Scopes } from "@autumn/shared";

describe("getOAuthConsentRequestedScopesFromFields", () => {
	test("uses top-level submitted consent scope over nested oauth_query scope", () => {
		expect(
			getOAuthConsentRequestedScopesFromFields({
				scope: Scopes.Customers.Read,
				oauth_query: new URLSearchParams({
					scope: `${Scopes.Customers.Read} ${Scopes.Customers.Write}`,
				}).toString(),
			}),
		).toEqual({
			explicit: true,
			scopes: [Scopes.Customers.Read],
		});
	});

	test("treats explicit empty submitted scope as explicit empty", () => {
		expect(
			getOAuthConsentRequestedScopesFromFields({
				scope: "",
				oauth_query: new URLSearchParams({
					scope: Scopes.Customers.Read,
				}).toString(),
			}),
		).toEqual({
			explicit: true,
			scopes: [],
		});
	});

	test("falls back to nested oauth_query scope when no submitted scope exists", () => {
		expect(
			getOAuthConsentRequestedScopesFromFields({
				oauth_query: JSON.stringify({
					scope: `${Scopes.Plans.Read} ${Scopes.Analytics.Read}`,
				}),
			}),
		).toEqual({
			explicit: false,
			scopes: [Scopes.Plans.Read, Scopes.Analytics.Read],
		});
	});
});
