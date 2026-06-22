/**
 * TDD test for the OAuth-disconnect webhook gap: when OAuth is removed from an
 * org that still has a secret key, the key's direct webhook (skipped while OAuth
 * covered the org) must be registered so the org keeps receiving events.
 *
 * Contract under test:
 *   reRegisterDirectWebhook({ org, env }):
 *     - secret key present for env -> registers a direct webhook, returns encrypted secret
 *     - no secret key for env -> returns null (nothing to register)
 *
 * Pre-impl red: helper did not exist; disconnecting OAuth left a key with no webhook.
 * Post-impl green: the remaining key gets a fresh direct webhook secret.
 */

import { describe, expect, mock, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";

const calls = { create: 0 };

mock.module("@/external/stripe/stripeOnboardingUtils.js", () => ({
	checkKeyValid: async () => {},
	createWebhookEndpoint: async () => {
		calls.create++;
		return { secret: "whsec_reregistered" };
	},
}));

const { reRegisterDirectWebhook } = await import(
	"@/internal/orgs/handlers/stripeHandlers/handleDeleteStripe.js"
);
const { encryptData, decryptData } = await import("@/utils/encryptUtils.js");

const logger = { error: () => {}, warn: () => {}, info: () => {} } as never;

const buildOrg = (hasKey: boolean): Organization =>
	({
		id: "org_reregister",
		slug: "reregister",
		stripe_config: hasKey ? { test_api_key: encryptData("sk_test_x") } : null,
		test_stripe_connect: {},
		live_stripe_connect: {},
	}) as unknown as Organization;

describe("dual-auth: re-register direct webhook after OAuth disconnect", () => {
	test("registers a webhook and returns an encrypted secret when a key remains", async () => {
		calls.create = 0;
		const result = await reRegisterDirectWebhook({
			org: buildOrg(true),
			env: AppEnv.Sandbox,
			logger,
		});

		expect(calls.create).toBe(1);
		expect(result).toBeTruthy();
		expect(decryptData(result as string)).toBe("whsec_reregistered");
	});

	test("returns null and registers nothing when no key remains", async () => {
		calls.create = 0;
		const result = await reRegisterDirectWebhook({
			org: buildOrg(false),
			env: AppEnv.Sandbox,
			logger,
		});

		expect(calls.create).toBe(0);
		expect(result).toBeNull();
	});
});
