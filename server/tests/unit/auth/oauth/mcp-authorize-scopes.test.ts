import { describe, expect, test } from "bun:test";
import { DEFAULT_OAUTH_RESOURCE_SCOPES, Scopes } from "@autumn/shared";
import { getMcpAuthorizeScopes } from "@/internal/auth/oauth/mcpAuthorizeScopes.js";

const registeredScopes = [...DEFAULT_OAUTH_RESOURCE_SCOPES, "offline_access"];

describe("getMcpAuthorizeScopes", () => {
	test("adds offline_access to the advertised resource scopes", () => {
		const scopes = getMcpAuthorizeScopes({
			clientScopes: registeredScopes,
			requestedScope: DEFAULT_OAUTH_RESOURCE_SCOPES.join(" "),
		});

		expect(scopes).toEqual([
			...DEFAULT_OAUTH_RESOURCE_SCOPES,
			"offline_access",
		]);
	});

	test("keeps offline_access single when the client already asked for it", () => {
		const scopes = getMcpAuthorizeScopes({
			clientScopes: registeredScopes,
			requestedScope: `${Scopes.Customers.Read} offline_access`,
		});

		expect(scopes).toEqual([Scopes.Customers.Read, "offline_access"]);
	});

	test("strips meta scopes a client tried to smuggle in", () => {
		const scopes = getMcpAuthorizeScopes({
			clientScopes: registeredScopes,
			requestedScope: `superuser owner ${Scopes.Customers.Read}`,
		});

		expect(scopes).toEqual([Scopes.Customers.Read, "offline_access"]);
	});

	test("skips offline_access for a client whose grant omits it", () => {
		const scopes = getMcpAuthorizeScopes({
			clientScopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			requestedScope: Scopes.Customers.Read,
		});

		expect(scopes).toEqual([Scopes.Customers.Read]);
	});

	test("adds offline_access when the client stores no scopes of its own", () => {
		const scopes = getMcpAuthorizeScopes({
			clientScopes: null,
			requestedScope: Scopes.Customers.Read,
		});

		expect(scopes).toEqual([Scopes.Customers.Read, "offline_access"]);
	});
});
