import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const state = {
	accountId: "acct_regression_a",
	existingOrg: null as null | Record<string, unknown>,
	updateConnectCalls: [] as Array<Record<string, unknown>>,
};

mock.module("@/db/initDrizzle.js", () => ({
	db: {},
	initDrizzle: () => ({ db: {} }),
}));
mock.module(
	"@/internal/platform/platformBeta/utils/oauthStateUtils.js",
	() => ({
		consumeOAuthState: async () => ({
			organization_slug: "target-sandbox",
			env: "sandbox",
			redirect_uri: "http://localhost:3000/cb",
			master_org_id: "org_master",
		}),
	}),
);
mock.module("@/external/connect/initStripeCli.js", () => ({
	initMasterStripe: () => ({
		oauth: { token: async () => ({ stripe_user_id: state.accountId }) },
	}),
}));
mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getBySlug: async () => ({
			id: "org_target",
			slug: "target-sandbox",
			name: "Target Sandbox",
		}),
		findByStripeAccountId: async () => state.existingOrg,
		updateStripeConnect: async (args: Record<string, unknown>) => {
			state.updateConnectCalls.push(args);
		},
	},
}));

import { handleOAuthCallback } from "@/internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js";

const runCallback = async () => {
	let redirectedTo = "";
	const c = {
		req: { query: () => ({ code: "ac_test", state: "st_test" }) },
		redirect: (url: string) => {
			redirectedTo = url;
			return new Response(null, { status: 302 });
		},
	} as unknown as Context<HonoEnv>;
	await handleOAuthCallback(c);
	return redirectedTo;
};

beforeEach(() => {
	state.existingOrg = null;
	state.updateConnectCalls = [];
});

describe("handleOAuthCallback enforces a 1-1 Stripe account to org link", () => {
	test("rejects an account already connected to another org and does not link it", async () => {
		state.existingOrg = {
			id: "org_other",
			name: "Other Org",
			slug: "other-org",
		};
		const redirectedTo = await runCallback();
		expect(redirectedTo).toContain("account_already_connected");
		expect(state.updateConnectCalls.length).toBe(0);
	});

	test("links the account when it is not connected anywhere else", async () => {
		state.existingOrg = null;
		const redirectedTo = await runCallback();
		expect(state.updateConnectCalls.length).toBe(1);
		expect(state.updateConnectCalls[0]).toMatchObject({
			orgId: "org_target",
			accountId: state.accountId,
		});
		expect(redirectedTo).toContain("success");
	});
});
