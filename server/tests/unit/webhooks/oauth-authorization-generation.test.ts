import { beforeEach, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import Stripe from "stripe";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

let accessible: boolean;
let checks: number;
await mockModuleWithRestore("@/external/connect/initStripeCli.js", () => ({
	initMasterStripe: () => ({
		accounts: {
			retrieve: async () => {
				checks++;
				if (!accessible)
					throw new Stripe.errors.StripePermissionError({
						type: "invalid_request_error",
						code: "account_invalid",
						message: "Access revoked",
					});
				return { id: "acct_reauthorized" };
			},
		},
	}),
}));
const { isStripeAuthorizationCurrent } = await import(
	"@/external/stripe/webhookHandlers/isStripeAuthorizationCurrent.js"
);
const ctx = {
	env: AppEnv.Sandbox,
	org: { test_stripe_connect: {} } as Organization,
};

beforeEach(() => {
	accessible = true;
	checks = 0;
});

test("ignores revocations predating the current authorization", async () => {
	expect(
		await isStripeAuthorizationCurrent({
			ctx,
			accountId: "acct_reauthorized",
			connectedAt: 201_000,
			eventCreated: 200,
		}),
	).toBe(true);
	expect(checks).toBe(0);
});

test("checks current Stripe access for same-second reauthorizations", async () => {
	expect(
		await isStripeAuthorizationCurrent({
			ctx,
			accountId: "acct_reauthorized",
			connectedAt: 200_500,
			eventCreated: 200,
		}),
	).toBe(true);
	accessible = false;
	expect(
		await isStripeAuthorizationCurrent({
			ctx,
			accountId: "acct_reauthorized",
			connectedAt: 200_500,
			eventCreated: 200,
		}),
	).toBe(false);
	expect(checks).toBe(2);
});

test("checks current access for legacy connections without a timestamp", async () => {
	expect(
		await isStripeAuthorizationCurrent({
			ctx,
			accountId: "acct_reauthorized",
			eventCreated: 200,
		}),
	).toBe(true);
	accessible = false;
	expect(
		await isStripeAuthorizationCurrent({
			ctx,
			accountId: "acct_reauthorized",
			eventCreated: 200,
		}),
	).toBe(false);
});
