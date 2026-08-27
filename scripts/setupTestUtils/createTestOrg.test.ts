import { afterEach, describe, expect, test } from "bun:test";
import { testOrgNeedsStripeAccount } from "./createTestOrg.ts";

describe("testOrgNeedsStripeAccount", () => {
	const prevSkip = process.env.TW_SKIP_STRIPE_ACCOUNT;

	afterEach(() => {
		if (prevSkip === undefined) delete process.env.TW_SKIP_STRIPE_ACCOUNT;
		else process.env.TW_SKIP_STRIPE_ACCOUNT = prevSkip;
	});

	test("needs an account when Connect is missing", () => {
		delete process.env.TW_SKIP_STRIPE_ACCOUNT;
		expect(testOrgNeedsStripeAccount({ org: {} })).toBe(true);
		expect(
			testOrgNeedsStripeAccount({
				org: { test_stripe_connect: { default_account_id: null } },
			}),
		).toBe(true);
	});

	test("does not need an account when Connect is already linked", () => {
		delete process.env.TW_SKIP_STRIPE_ACCOUNT;
		expect(
			testOrgNeedsStripeAccount({
				org: { test_stripe_connect: { default_account_id: "acct_123" } },
			}),
		).toBe(false);
	});

	test("skips attach in tw worker warm-parent mode", () => {
		process.env.TW_SKIP_STRIPE_ACCOUNT = "1";
		expect(testOrgNeedsStripeAccount({ org: {} })).toBe(false);
	});
});
