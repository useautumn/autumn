/**
 * TDD test for Stripe dual-auth channel-specific disconnect.
 *
 * Contract under test:
 *   resolveDisconnectChannels({ org, env, channel }) -> { clearSecretKey, clearOauth }
 *     - channel "secret_key": clearSecretKey true, clearOauth false (leaves oauth intact)
 *     - channel "oauth": clearOauth true, clearSecretKey false (leaves key + direct webhook intact)
 *     - channel undefined (legacy): clears whichever channel(s) are present for the env
 *
 *   computeClearedStripeConfig / computeClearedStripeConnect (pure field mutators):
 *     - clearing secret key nulls *_api_key + *_webhook_secret, leaves *_connect_webhook_secret + account_id
 *     - clearing oauth deletes account_id, leaves stripe_config untouched
 *
 * Pre-impl red: these helpers do not exist; disconnect is all-or-nothing branched on
 * throughSecretKey.
 * Post-impl green: disconnect is channel-scoped and never clears the other channel.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	computeClearedStripeConfig,
	computeClearedStripeConnect,
	resolveDisconnectChannels,
} from "@/internal/orgs/handlers/stripeHandlers/handleDeleteStripe.js";
import { encryptData } from "@/utils/encryptUtils.js";

const buildOrg = (overrides: Partial<Organization> = {}): Organization =>
	({
		id: "org_disconnect",
		slug: "disconnect",
		test_stripe_connect: {},
		live_stripe_connect: {},
		stripe_config: null,
		...overrides,
	}) as unknown as Organization;

const dualOrg = () =>
	buildOrg({
		stripe_config: {
			test_api_key: encryptData("sk_test"),
			test_webhook_secret: encryptData("whsec_direct"),
			test_connect_webhook_secret: encryptData("whsec_connect"),
		} as any,
		test_stripe_connect: { account_id: "acct_dual" },
	});

describe("dual-auth: resolveDisconnectChannels", () => {
	const org = dualOrg();
	const env = AppEnv.Sandbox;

	test("channel secret_key clears only the secret key", () => {
		const res = resolveDisconnectChannels({ org, env, channel: "secret_key" });
		expect(res.clearSecretKey).toBe(true);
		expect(res.clearOauth).toBe(false);
	});

	test("channel oauth clears only oauth", () => {
		const res = resolveDisconnectChannels({ org, env, channel: "oauth" });
		expect(res.clearOauth).toBe(true);
		expect(res.clearSecretKey).toBe(false);
	});

	test("no channel (legacy) clears both present channels", () => {
		const res = resolveDisconnectChannels({ org, env, channel: undefined });
		expect(res.clearSecretKey).toBe(true);
		expect(res.clearOauth).toBe(true);
	});
});

describe("dual-auth: channel-scoped field mutators leave the other channel intact", () => {
	test("clearing secret key nulls api key + direct webhook, keeps connect secret", () => {
		const org = dualOrg();
		const cleared = computeClearedStripeConfig({
			org,
			env: AppEnv.Sandbox,
		});

		expect(cleared.test_api_key ?? null).toBeNull();
		expect(cleared.test_webhook_secret ?? null).toBeNull();
		expect(cleared.test_connect_webhook_secret).toBeTruthy();
	});

	test("clearing oauth deletes account_id only, stripe_config untouched", () => {
		const org = dualOrg();
		const clearedConnect = computeClearedStripeConnect({
			org,
			env: AppEnv.Sandbox,
		});

		expect(clearedConnect.account_id ?? null).toBeNull();
		// secret key + connect secret on stripe_config are not this helper's concern;
		// they must remain on the org untouched.
		expect(org.stripe_config?.test_api_key).toBeTruthy();
		expect(org.stripe_config?.test_connect_webhook_secret).toBeTruthy();
	});
});
