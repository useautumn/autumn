/** Channel resolution clears catalog mappings only when the last Stripe channel is removed.
 * Channel-specific config mutation must continue preserving the other channel. */

import { describe, expect, test } from "bun:test";
import { AppEnv, type Organization, type StripeConfig } from "@autumn/shared";
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
		} satisfies StripeConfig,
		test_stripe_connect: { account_id: "acct_dual" },
	});

describe("dual-auth: resolveDisconnectChannels", () => {
	const org = dualOrg();
	const env = AppEnv.Sandbox;

	test("channel secret_key clears only the secret key", () => {
		const res = resolveDisconnectChannels({ org, env, channel: "secret_key" });
		expect(res.clearSecretKey).toBe(true);
		expect(res.clearOauth).toBe(false);
		expect(res.clearCatalogMappings).toBe(false);
	});

	test("channel oauth clears only oauth", () => {
		const res = resolveDisconnectChannels({ org, env, channel: "oauth" });
		expect(res.clearOauth).toBe(true);
		expect(res.clearSecretKey).toBe(false);
		expect(res.clearCatalogMappings).toBe(false);
	});

	test("no channel (legacy) clears both present channels", () => {
		const res = resolveDisconnectChannels({ org, env, channel: undefined });
		expect(res.clearSecretKey).toBe(true);
		expect(res.clearOauth).toBe(true);
		expect(res.clearCatalogMappings).toBe(true);
	});

	test("clearing the only connected channel clears catalog mappings", () => {
		const secretOnly = buildOrg({
			stripe_config: {
				test_api_key: encryptData("sk_test"),
			} satisfies StripeConfig,
		});
		const oauthOnly = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth" },
		});

		expect(
			resolveDisconnectChannels({
				org: secretOnly,
				env,
				channel: "secret_key",
			}).clearCatalogMappings,
		).toBe(true);
		expect(
			resolveDisconnectChannels({
				org: oauthOnly,
				env,
				channel: "oauth",
			}).clearCatalogMappings,
		).toBe(true);
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
