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

		await expect(
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
