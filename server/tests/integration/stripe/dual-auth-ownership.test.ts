import { describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import { validateStripeSubscriptionActionOwnership } from "@/internal/billing/v2/providers/stripe/utils/connect/validateStripeSubscriptionActionOwnership.js";
import { encryptData } from "@/utils/encryptUtils.js";

const ORIGINAL_CLIENT_ID = process.env.STRIPE_SANDBOX_CLIENT_ID;

const buildOrg = (overrides: Partial<Organization> = {}): Organization =>
	({
		id: "org_ownership",
		slug: "ownership",
		test_stripe_connect: {},
		live_stripe_connect: {},
		stripe_config: null,
		...overrides,
	}) as unknown as Organization;

const buildCtx = (org: Organization) => ({ org, env: AppEnv.Sandbox }) as any;

const buildBillingContext = (applicationId: string) =>
	({
		stripeSubscription: {
			id: "sub_123",
			application: applicationId,
		},
	}) as any;

const updateAction = { type: "update" } as any;

describe("dual-auth: subscription ownership gate", () => {
	test("skipped (no throw) when a secret key exists alongside oauth account_id", () => {
		process.env.STRIPE_SANDBOX_CLIENT_ID = "ca_autumn_platform";
		const org = buildOrg({
			stripe_config: { test_api_key: encryptData("sk_test_dual") } as any,
			test_stripe_connect: { account_id: "acct_dual" },
		});

		expect(() =>
			validateStripeSubscriptionActionOwnership({
				ctx: buildCtx(org),
				billingContext: buildBillingContext("ca_some_other_platform"),
				stripeSubscriptionAction: updateAction,
			}),
		).not.toThrow();

		process.env.STRIPE_SANDBOX_CLIENT_ID = ORIGINAL_CLIENT_ID;
	});

	test("active (throws) when only oauth account_id is present and application id mismatches", () => {
		process.env.STRIPE_SANDBOX_CLIENT_ID = "ca_autumn_platform";
		const org = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth_only" },
		});

		expect(() =>
			validateStripeSubscriptionActionOwnership({
				ctx: buildCtx(org),
				billingContext: buildBillingContext("ca_some_other_platform"),
				stripeSubscriptionAction: updateAction,
			}),
		).toThrow();

		process.env.STRIPE_SANDBOX_CLIENT_ID = ORIGINAL_CLIENT_ID;
	});
});
