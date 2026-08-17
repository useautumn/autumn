import { describe, expect, test } from "bun:test";
import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { oauthTokenErrorResponse } from "@/internal/auth/oauth/token/oauthTokenErrorResponse.js";
import {
	OAuthTokenScopeError,
	parseOAuthTokenResponseScopes,
} from "@/internal/auth/oauth/token/parseOAuthTokenResponseScopes.js";

describe("parseOAuthTokenResponseScopes", () => {
	test("splits the granted scope string and separates the resource scopes", () => {
		expect(
			parseOAuthTokenResponseScopes({
				scope: `openid offline_access ${Scopes.Customers.Read}`,
			}),
		).toEqual({
			scopes: ["openid", "offline_access", Scopes.Customers.Read],
			resourceScopes: [Scopes.Customers.Read],
		});
	});

	test("treats an absent scope claim as unknown, not as an empty grant", () => {
		expect(parseOAuthTokenResponseScopes({ scope: undefined })).toEqual({
			scopes: null,
			resourceScopes: null,
		});
	});

	test("reads an empty scope string as an empty grant", () => {
		expect(parseOAuthTokenResponseScopes({ scope: "  " })).toEqual({
			scopes: [],
			resourceScopes: [],
		});
	});

	test("rejects a scope string naming permissions this AS does not define", () => {
		expect(() =>
			parseOAuthTokenResponseScopes({
				scope: `${Scopes.Customers.Read} customers:teleport`,
			}),
		).toThrow(OAuthTokenScopeError);
	});
});

describe("oauthTokenErrorResponse", () => {
	test("answers a malformed token-response scope with invalid_scope", async () => {
		let caught: unknown;
		try {
			parseOAuthTokenResponseScopes({ scope: "customers:teleport" });
		} catch (error) {
			caught = error;
		}

		const response = oauthTokenErrorResponse({ error: caught });
		expect(response?.status).toBe(400);
		expect(await response?.json()).toEqual({
			error: "invalid_scope",
			error_description:
				"Token response names undefined scopes: customers:teleport",
		});
	});

	test("keeps mapping grant failures to invalid_grant at their own status", async () => {
		const response = oauthTokenErrorResponse({
			error: new RecaseError({
				message: "OAuth token consent is ambiguous",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			}),
		});

		expect(response?.status).toBe(401);
		expect(await response?.json()).toEqual({
			error: "invalid_grant",
			error_description: "OAuth token consent is ambiguous",
		});
	});

	test("passes non-OAuth failures back to the caller", () => {
		expect(
			oauthTokenErrorResponse({ error: new Error("database unavailable") }),
		).toBeNull();
	});
});
