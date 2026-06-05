import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { OAuth2Tokens } from "arctic";

const mockValidateAuthorizationCode = mock(() =>
	Promise.resolve(
		new OAuth2Tokens({
			access_token: "atk_test_token",
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: "rtk_test_token",
			scope: "project_configuration:projects:read",
		}),
	),
);

mock.module("arctic", () => ({
	OAuth2Client: class {
		createAuthorizationURLWithPKCE() {
			return new URL("https://api.revenuecat.com/oauth2/authorize?test=1");
		}
		validateAuthorizationCode = mockValidateAuthorizationCode;
		refreshAccessToken = mock(() => Promise.resolve(new OAuth2Tokens({})));
	},
	CodeChallengeMethod: { S256: 0, Plain: 1 },
	generateCodeVerifier: () => "test-code-verifier",
	generateState: () => "test-state",
	OAuth2Tokens,
}));

const { exchangeRcCode } = await import(
	"@/external/revenueCat/misc/revenuecatOAuth.js"
);

describe("exchangeRcCode", () => {
	beforeEach(() => {
		process.env.REVENUECAT_OAUTH_CLIENT_ID = "rc_client_id";
		process.env.REVENUECAT_OAUTH_CLIENT_SECRET = "rc_client_secret";
		process.env.BETTER_AUTH_URL = "https://auth.example.com";
		mockValidateAuthorizationCode.mockClear();
	});

	afterEach(() => {
		delete process.env.REVENUECAT_OAUTH_CLIENT_ID;
		delete process.env.REVENUECAT_OAUTH_CLIENT_SECRET;
	});

	test("exchanges authorization code for tokens", async () => {
		const tokens = await exchangeRcCode({
			code: "auth_code_123",
			codeVerifier: "verifier_abc",
		});

		expect(mockValidateAuthorizationCode).toHaveBeenCalledWith(
			"https://api.revenuecat.com/oauth2/token",
			"auth_code_123",
			"verifier_abc",
		);
		expect(tokens.accessToken()).toBe("atk_test_token");
		expect(tokens.refreshToken()).toBe("rtk_test_token");
	});
});
