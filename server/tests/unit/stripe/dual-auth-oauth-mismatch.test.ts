import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	secretKeyAccountId: "acct_secret",
	oauthAccountId: "acct_secret",
	updateStripeConnectCalls: 0,
};

const realInitDrizzle = await import("@/db/initDrizzle.js");
await mockModuleWithRestore("@/db/initDrizzle.js", () => ({
	...realInitDrizzle,
	initDrizzle: () => ({ db: {} }),
}));

await mockModuleWithRestore(
	"@/internal/platform/platformBeta/utils/oauthStateUtils.js",
	() => ({
		consumeOAuthState: async () => ({
			organization_slug: "test-org",
			env: "sandbox",
			redirect_uri: "http://localhost:3000/sandbox/dev?tab=stripe",
			master_org_id: null,
		}),
	}),
);

await mockModuleWithRestore("@/external/connect/initStripeCli.js", () => ({
	initMasterStripe: () => ({
		balance: { retrieve: async () => ({}) },
		oauth: {
			token: async () => ({ stripe_user_id: state.oauthAccountId }),
		},
	}),
}));

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		accounts: { retrieve: async () => ({ id: state.secretKeyAccountId }) },
	}),
}));

await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getBySlug: async () => ({
			id: "org_test",
			slug: "test-org",
			stripe_config: { test_api_key: "enc_key" },
			test_stripe_connect: {},
			live_stripe_connect: {},
		}),
		findByStripeAccountId: async () => null,
		updateStripeConnect: async () => {
			state.updateStripeConnectCalls++;
		},
	},
}));

await mockModuleWithRestore("@/internal/orgs/orgUtils.js", () => ({
	isStripeConnected: () => true,
}));

const { handleOAuthCallback } = await import(
	"@/internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js"
);

const callbackRedirect = async () => {
	const app = new Hono();
	app.get("/stripe/oauth_callback", handleOAuthCallback as never);
	const res = await app.request("/stripe/oauth_callback?code=ac_x&state=st_x", {
		redirect: "manual",
	});
	return res.headers.get("location") ?? "";
};

describe("dual-auth: OAuth callback account-match guard", () => {
	test("mismatched account redirects with account_mismatch and does NOT persist", async () => {
		state.secretKeyAccountId = "acct_secret";
		state.oauthAccountId = "acct_different_oauth";
		state.updateStripeConnectCalls = 0;

		const location = await callbackRedirect();

		expect(location).toContain("error=account_mismatch");
		expect(location).toContain("secret_key_account_id=acct_secret");
		expect(state.updateStripeConnectCalls).toBe(0);
	});

	test("matching account persists and redirects success", async () => {
		state.secretKeyAccountId = "acct_secret";
		state.oauthAccountId = "acct_secret";
		state.updateStripeConnectCalls = 0;

		const location = await callbackRedirect();

		expect(location).toContain("success=true");
		expect(state.updateStripeConnectCalls).toBe(1);
	});
});
