/**
 * TDD test for Stripe dual-auth account-match guard: both channels MUST point at
 * the same Stripe account. Adding a secret key whose account differs from the
 * already-connected OAuth account must be rejected (no corrupt cross-account state).
 *
 * Contract under test:
 *   handleStripeSecretKey:
 *     - OAuth account_id set AND differs from the secret key's account -> throws (rejected)
 *     - OAuth account_id set AND matches the secret key's account -> succeeds
 *     - no OAuth connected -> succeeds (nothing to match against)
 *
 * Pre-impl red: no account comparison existed; a mismatched key would be stored.
 * Post-impl green: the mismatch throws before any persistence.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";

const mockAccount = { id: "acct_from_secret_key" };

mock.module("stripe", () => ({
	default: class FakeStripe {
		accounts = {
			retrieve: async () => mockAccount,
		};
		webhookEndpoints = {
			list: async () => ({ data: [] }),
			del: async () => ({}),
			create: async () => ({ secret: "whsec_direct" }),
		};
	},
}));

mock.module("@/external/stripe/stripeOnboardingUtils.js", () => ({
	checkKeyValid: async () => {},
	createWebhookEndpoint: async () => ({ secret: "whsec_direct" }),
}));

const { handleStripeSecretKey } = await import(
	"@/internal/orgs/orgUtils/handleStripeSecretKey.js"
);

const buildOrg = (oauthAccountId?: string): Organization =>
	({
		id: "org_match",
		slug: "match",
		test_stripe_connect: oauthAccountId ? { account_id: oauthAccountId } : {},
		live_stripe_connect: {},
		stripe_config: null,
	}) as unknown as Organization;

describe("dual-auth: secret key must match OAuth account", () => {
	beforeEach(() => {
		mockAccount.id = "acct_from_secret_key";
	});

	test("throws when OAuth account differs from the secret key account", async () => {
		const org = buildOrg("acct_different_oauth");

		expect(
			handleStripeSecretKey({
				orgId: org.id,
				secretKey: "sk_test_x",
				env: AppEnv.Sandbox,
				org,
			}),
		).rejects.toThrow();
	});

	test("succeeds when OAuth account matches the secret key account", async () => {
		const org = buildOrg("acct_from_secret_key");

		const result = await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_x",
			env: AppEnv.Sandbox,
			org,
		});

		expect(result.test_api_key).toBeTruthy();
	});

	test("succeeds when no OAuth is connected", async () => {
		const org = buildOrg();

		const result = await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_x",
			env: AppEnv.Sandbox,
			org,
		});

		expect(result.test_api_key).toBeTruthy();
	});
});
