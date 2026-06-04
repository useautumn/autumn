import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { isOAuthConsentLinkedApiKey } from "@/internal/auth/repos/oauthApiKeyRepo.js";

type GuardApiKey = Parameters<typeof isOAuthConsentLinkedApiKey>[0]["apiKey"];

const oauthMeta = {
	created_via: "oauth",
	oauth_consent_id: "consent_123",
	oauth_client_id: "autumn_mcp_cursor",
	oauth_redirect_uri: "cursor://oauth/callback",
	env: AppEnv.Sandbox,
};

const baseApiKey: GuardApiKey = {
	id: "key_123",
	orgId: "org_123",
	userId: "user_123",
	env: AppEnv.Sandbox,
	hashedKey: "hashed",
	meta: oauthMeta,
};

const matchesConsent = (apiKey: GuardApiKey) =>
	isOAuthConsentLinkedApiKey({
		apiKey,
		consentId: "consent_123",
		clientId: "autumn_mcp_cursor",
		redirectUri: "cursor://oauth/callback",
		orgId: "org_123",
		userId: "user_123",
		env: AppEnv.Sandbox,
	});

describe("isOAuthConsentLinkedApiKey", () => {
	test("accepts an OAuth-created key linked to the same consent", () => {
		expect(matchesConsent(baseApiKey)).toBe(true);
	});

	test("rejects a user-created key even if it is the stored api key id", () => {
		expect(
			matchesConsent({
				...baseApiKey,
				meta: { created_via: "dashboard" },
			}),
		).toBe(false);
	});

	test("rejects an OAuth key linked to a different consent", () => {
		expect(
			matchesConsent({
				...baseApiKey,
				meta: {
					...oauthMeta,
					oauth_consent_id: "consent_other",
				},
			}),
		).toBe(false);
	});

	test("rejects an OAuth key linked to a different redirect URI", () => {
		expect(
			isOAuthConsentLinkedApiKey({
				apiKey: baseApiKey,
				consentId: "consent_123",
				clientId: "autumn_mcp_cursor",
				redirectUri: "cursor://oauth/other-callback",
				orgId: "org_123",
				userId: "user_123",
				env: AppEnv.Sandbox,
			}),
		).toBe(false);
	});

	test("rejects an OAuth key with different ownership or env", () => {
		expect(matchesConsent({ ...baseApiKey, orgId: "org_other" })).toBe(false);
		expect(matchesConsent({ ...baseApiKey, userId: "user_other" })).toBe(false);
		expect(matchesConsent({ ...baseApiKey, env: AppEnv.Live })).toBe(false);
	});
});
