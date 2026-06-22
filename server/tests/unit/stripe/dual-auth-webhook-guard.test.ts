/**
 * TDD test for Stripe dual-auth webhook registration guards.
 *
 * Contract under test:
 *   handleStripeSecretKey (adding a secret key):
 *     - when OAuth account_id ALREADY exists for the env: MUST NOT create/delete a direct
 *       webhook (no webhookEndpoints.create / .list / .del), and MUST NOT return a
 *       *_webhook_secret. Returns only the encrypted api key.
 *     - when NO OAuth account_id: registers a direct webhook as before and returns the secret.
 *
 * "No cross-channel teardown": adding a secret key never touches the master connect webhook;
 * the only Stripe webhook mutations it may perform are on the org's OWN account, and those are
 * suppressed entirely when OAuth already covers the org.
 *
 * Pre-impl red: handleStripeSecretKey currently always lists/deletes/creates a direct webhook
 * regardless of an existing OAuth connection, and always returns a *_webhook_secret.
 * Post-impl green: the OAuth-present branch skips all webhook mutations.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";

const calls = {
	create: 0,
	list: 0,
	del: 0,
};

const resetCalls = () => {
	calls.create = 0;
	calls.list = 0;
	calls.del = 0;
};

mock.module("stripe", () => {
	return {
		default: class FakeStripe {
			accounts = {
				retrieve: async () => ({
					id: "acct_oauth_existing",
					default_currency: "usd",
				}),
			};
			webhookEndpoints = {
				list: async () => {
					calls.list++;
					return { data: [] };
				},
				del: async () => {
					calls.del++;
					return {};
				},
				create: async () => {
					calls.create++;
					return { secret: "whsec_direct" };
				},
			};
		},
	};
});

mock.module("@/external/stripe/stripeOnboardingUtils.js", () => ({
	checkKeyValid: async () => {},
	createWebhookEndpoint: async () => {
		calls.create++;
		return { secret: "whsec_direct" };
	},
}));

const { handleStripeSecretKey } = await import(
	"@/internal/orgs/orgUtils/handleStripeSecretKey.js"
);

const buildOrg = (overrides: Partial<Organization> = {}): Organization =>
	({
		id: "org_webhook_guard",
		slug: "webhook-guard",
		test_stripe_connect: {},
		live_stripe_connect: {},
		stripe_config: null,
		...overrides,
	}) as unknown as Organization;

describe("dual-auth: handleStripeSecretKey webhook guard", () => {
	beforeEach(() => resetCalls());

	test("OAuth already connected -> skips direct webhook registration, no webhook secret", async () => {
		const org = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth_existing" },
		});

		const result = await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_added",
			env: AppEnv.Sandbox,
			org,
		});

		expect(calls.create).toBe(0);
		expect(calls.del).toBe(0);
		expect(result.test_api_key).toBeTruthy();
		expect(result.test_webhook_secret ?? null).toBeNull();
	});

	test("no OAuth -> registers direct webhook and returns secret", async () => {
		const org = buildOrg();

		const result = await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_added",
			env: AppEnv.Sandbox,
			org,
		});

		expect(calls.create).toBe(1);
		expect(result.test_api_key).toBeTruthy();
		expect(result.test_webhook_secret).toBeTruthy();
	});
});
