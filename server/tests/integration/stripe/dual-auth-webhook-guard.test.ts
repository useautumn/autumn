import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";

const calls = {
	create: 0,
	list: 0,
	del: 0,
};

let staleWebhooks: Array<{ id: string; url: string }> = [];
let deletedIds: string[] = [];

const resetCalls = () => {
	calls.create = 0;
	calls.list = 0;
	calls.del = 0;
	staleWebhooks = [];
	deletedIds = [];
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
					return { data: staleWebhooks };
				},
				del: async (id: string) => {
					calls.del++;
					deletedIds.push(id);
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
		expect(result.test_api_key).toBeTruthy();
		expect(result.test_webhook_secret ?? null).toBeNull();
	});

	test("OAuth connected -> deletes a stale direct webhook so it can't double-deliver", async () => {
		staleWebhooks = [
			{
				id: "we_stale",
				url: `https://x/webhooks/stripe/org_webhook_guard/sandbox`,
			},
		];
		const org = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth_existing" },
		});

		await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_added",
			env: AppEnv.Sandbox,
			org,
		});

		expect(calls.del).toBe(1);
		expect(calls.create).toBe(0);
	});

	test("OAuth connected + a secret already stored -> deletes endpoint and returns null secret to clear it", async () => {
		staleWebhooks = [
			{
				id: "we_stale",
				url: "https://x/webhooks/stripe/org_webhook_guard/sandbox",
			},
		];
		const org = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth_existing" },
			stripe_config: { test_webhook_secret: "whsec_stale_stored" },
		});

		const result = await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_added",
			env: AppEnv.Sandbox,
			org,
		});

		expect(deletedIds).toEqual(["we_stale"]);
		expect(result.test_webhook_secret ?? null).toBeNull();
	});

	test("deletes only this org's webhook for this env — leaves other env/org alone", async () => {
		staleWebhooks = [
			{
				id: "we_match",
				url: "https://x/webhooks/stripe/org_webhook_guard/sandbox",
			},
			{
				id: "we_other_env",
				url: "https://x/webhooks/stripe/org_webhook_guard/live",
			},
			{
				id: "we_other_org",
				url: "https://x/webhooks/stripe/other_org/sandbox",
			},
		];
		const org = buildOrg();

		await handleStripeSecretKey({
			orgId: org.id,
			secretKey: "sk_test_added",
			env: AppEnv.Sandbox,
			org,
		});

		expect(deletedIds).toEqual(["we_match"]);
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
