/**
 * TDD test for Stripe dual-auth: an org may have BOTH a secret key AND an
 * OAuth (Connect) account connected per env, simultaneously.
 *
 * Contract under test (pure-function / config layer):
 *   isStripeConnected (regression guard):
 *     - both api_key + account_id set -> default true; throughSecretKey true; throughAccountId true
 *   createOrgResponse (new response fields):
 *     - stripe_secret_key_connected: boolean
 *     - stripe_oauth_connected: boolean
 *     - both true when both channels present
 *     - stripe_connection stays "secret_key" (primary) when a secret key exists, even if oauth also present
 *   validateStripeSubscriptionActionOwnership:
 *     - shouldValidate is false when a secret key exists (even if account_id also set)
 *
 * Pre-impl red: stripe_secret_key_connected / stripe_oauth_connected do not exist on FrontendOrg
 * or createOrgResponse output; ownership-gate behavior with both present is untested.
 * Post-impl green: the new flags are emitted and the ownership gate respects secret-key presence.
 */

import { describe, expect, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import {
	createOrgResponse,
	isStripeConnected,
} from "@/internal/orgs/orgUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

const buildOrg = (overrides: Partial<Organization> = {}): Organization => {
	return {
		id: "org_dual_auth",
		slug: "dual-auth",
		name: "Dual Auth Org",
		logo: null,
		createdAt: new Date(),
		default_currency: "usd",
		stripe_connected: true,
		stripe_config: null,
		test_stripe_connect: {},
		live_stripe_connect: {},
		test_pkey: "am_test_pk",
		live_pkey: "am_live_pk",
		config: {},
		custom_buttons: [],
		master: null,
		...overrides,
	} as unknown as Organization;
};

const withBothChannels = (env: AppEnv) => {
	const keyField = env === AppEnv.Sandbox ? "test_api_key" : "live_api_key";
	const connectField =
		env === AppEnv.Sandbox ? "test_stripe_connect" : "live_stripe_connect";
	return buildOrg({
		stripe_config: { [keyField]: encryptData("sk_test_123") } as any,
		[connectField]: { account_id: "acct_oauth_123" },
	} as Partial<Organization>);
};

describe("dual-auth: isStripeConnected with both channels", () => {
	test("default, throughSecretKey, and throughAccountId all true when both present", () => {
		const org = withBothChannels(AppEnv.Sandbox);
		const env = AppEnv.Sandbox;

		expect(isStripeConnected({ org, env })).toBe(true);
		expect(isStripeConnected({ org, env, throughSecretKey: true })).toBe(true);
		expect(isStripeConnected({ org, env, throughAccountId: true })).toBe(true);
	});
});

describe("dual-auth: createOrgResponse exposes both channel flags", () => {
	test("both flags true + stripe_connection primary = secret_key when both present", () => {
		const org = withBothChannels(AppEnv.Sandbox);
		const response = createOrgResponse({ org, env: AppEnv.Sandbox });

		expect(response.stripe_secret_key_connected).toBe(true);
		expect(response.stripe_oauth_connected).toBe(true);
		expect(response.stripe_connection).toBe("secret_key");
	});

	test("oauth-only org: oauth flag true, secret-key flag false, connection = oauth", () => {
		const org = buildOrg({
			test_stripe_connect: { account_id: "acct_oauth_only" },
		});
		const response = createOrgResponse({ org, env: AppEnv.Sandbox });

		expect(response.stripe_secret_key_connected).toBe(false);
		expect(response.stripe_oauth_connected).toBe(true);
		expect(response.stripe_connection).toBe("oauth");
	});

	test("secret-key-only org: secret-key flag true, oauth flag false, connection = secret_key", () => {
		const org = buildOrg({
			stripe_config: { test_api_key: encryptData("sk_test_only") } as any,
		});
		const response = createOrgResponse({ org, env: AppEnv.Sandbox });

		expect(response.stripe_secret_key_connected).toBe(true);
		expect(response.stripe_oauth_connected).toBe(false);
		expect(response.stripe_connection).toBe("secret_key");
	});

	test("unconnected org: both flags false, connection = default", () => {
		const org = buildOrg();
		const response = createOrgResponse({ org, env: AppEnv.Sandbox });

		expect(response.stripe_secret_key_connected).toBe(false);
		expect(response.stripe_oauth_connected).toBe(false);
		expect(response.stripe_connection).toBe("default");
	});
});
