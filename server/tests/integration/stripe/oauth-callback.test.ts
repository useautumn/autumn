import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { AppEnv, type Organization } from "@autumn/shared";
import { Hono } from "hono";
import { initDrizzle } from "@/db/initDrizzle.js";
import { initMasterStripe } from "@/external/connect/initStripeCli.js";
import { handleOAuthCallback } from "@/internal/orgs/handlers/stripeHandlers/handleOAuthCallback.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	consumeOAuthState,
	generateOAuthState,
} from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = initDrizzle();
const orgs: Organization[] = [];
const accounts: string[] = [];
const masterId = "org_callback_master";
const returnUrl = "https://platform.example/return?keep=yes";
const stripe = initMasterStripe({ env: AppEnv.Sandbox });
const token = spyOn(stripe.oauth, "token");
const app = new Hono().get("/callback", handleOAuthCallback as never);

const createOrg = async ({ owner = masterId }: { owner?: string } = {}) => {
	const id = generateId("org");
	const org = await OrgService.create({
		db,
		id,
		slug: `${id}|${owner}`,
		name: "Callback fixture",
		createdBy: owner,
	});
	orgs.push(org);
	return org;
};

const stateFor = ({
	org,
	master = masterId,
}: {
	org: Organization;
	master?: string | null;
}) =>
	generateOAuthState({
		organizationSlug: org.slug,
		env: AppEnv.Sandbox,
		redirectUri: returnUrl,
		masterOrgId: master,
	});

const callback = async ({
	state,
	code = "consent_code",
	error,
}: {
	state?: string;
	code?: string;
	error?: string;
}) => {
	const query = new URLSearchParams({ code });
	if (state) query.set("state", state);
	if (error) query.set("error", error);
	const response = await app.request(`/callback?${query}`);
	expect(response.status).toBe(302);
	return new URL(response.headers.get("location")!);
};

const expectFailure = ({
	url,
	error,
	custom = true,
}: {
	url: URL;
	error: string;
	custom?: boolean;
}) => {
	expect(url.searchParams.get("success")).toBe("false");
	expect(url.searchParams.get("error")).toBe(error);
	expect(url.searchParams.get("message")?.length).toBeGreaterThan(0);
	if (custom) {
		expect(url.origin + url.pathname).toBe("https://platform.example/return");
		expect(url.searchParams.get("keep")).toBe("yes");
	}
};

afterEach(async () => {
	token.mockReset();
	for (const org of orgs.splice(0))
		await OrgService.delete({ db, orgId: org.id });
	for (const account of accounts.splice(0)) await stripe.accounts.del(account);
});

afterAll(() => token.mockRestore());

test("OAuth callback failures use trusted state return URL and stable error contract", async () => {
	const org = await createOrg();
	const state = await stateFor({ org });
	expectFailure({
		url: await callback({ state, error: "access_denied", code: "" }),
		error: "access_denied",
	});
	expect(await consumeOAuthState({ stateKey: state })).toBeNull();
	expect(token).not.toHaveBeenCalled();
	expectFailure({
		url: await callback({ state }),
		error: "invalid_state",
		custom: false,
	});
	expectFailure({
		url: await callback({}),
		error: "missing_parameters",
		custom: false,
	});
	expectFailure({
		url: await callback({ state: await stateFor({ org }), code: "" }),
		error: "missing_parameters",
	});
	token.mockRejectedValueOnce(new Error("sensitive_provider_detail"));
	const failedToken = await callback({ state: await stateFor({ org }) });
	expectFailure({ url: failedToken, error: "oauth_callback_failed" });
	expect(failedToken.toString()).not.toContain("sensitive_provider_detail");
	expectFailure({
		url: await callback({
			state: await stateFor({ org }),
			error: "untrusted_provider_error",
		}),
		error: "oauth_authorization_failed",
	});
	token.mockResolvedValueOnce({});
	expectFailure({
		url: await callback({ state: await stateFor({ org }) }),
		error: "account_id_not_found",
	});
	const missingOrgState = await stateFor({
		org: { ...org, slug: "nonexistent-callback-org" },
	});
	expectFailure({
		url: await callback({ state: missingOrgState }),
		error: "org_not_found",
	});
});

test("OAuth callback reconnects the same org and ignores other-environment links", async () => {
	const org = await createOrg();
	const other = await createOrg();
	const account = await stripe.accounts.create({
		type: "standard",
		country: "US",
	});
	const accountId = account.id;
	accounts.push(accountId);
	token.mockResolvedValue({ stripe_user_id: accountId });
	await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			test_stripe_connect: { account_id: accountId, master_org_id: masterId },
		},
	});
	const reconnected = await callback({ state: await stateFor({ org }) });
	expect(reconnected.searchParams.get("success")).toBe("true");
	const rebound = await OrgService.get({ db, orgId: org.id });
	expect(rebound.test_stripe_connect?.master_org_id).toBeUndefined();
	await OrgService.update({
		db,
		orgId: org.id,
		updates: { test_stripe_connect: {} },
	});
	await OrgService.update({
		db,
		orgId: other.id,
		updates: { live_stripe_connect: { account_id: accountId } },
	});
	const connected = await callback({ state: await stateFor({ org }) });
	expect(connected.searchParams.get("success")).toBe("true");
	const saved = await OrgService.get({ db, orgId: org.id });
	expect(saved.test_stripe_connect?.account_id).toBe(accountId);
});

test("OAuth callback discloses conflict identity only within the requesting platform", async () => {
	const org = await createOrg();
	const other = await createOrg();
	const accountId = generateId("acct");
	token.mockResolvedValue({ stripe_user_id: accountId });
	await OrgService.update({
		db,
		orgId: other.id,
		updates: { test_stripe_connect: { account_id: accountId } },
	});
	const sameMaster = await callback({ state: await stateFor({ org }) });
	expectFailure({ url: sameMaster, error: "account_already_connected" });
	expect(sameMaster.searchParams.get("connected_org_slug")).toBe(
		other.slug.split("|")[0],
	);
	expect(sameMaster.searchParams.get("connected_org_name")).toBe(other.name);
	for (const master of [null]) {
		const privateConflict = await callback({
			state: await stateFor({ org, master }),
		});
		expectFailure({ url: privateConflict, error: "account_already_connected" });
		expect(privateConflict.searchParams.has("connected_org_slug")).toBe(false);
		expect(privateConflict.searchParams.has("connected_org_name")).toBe(false);
		expect(privateConflict.toString()).not.toContain(other.id);
	}
	await OrgService.update({
		db,
		orgId: other.id,
		updates: { created_by: "org_other_master" },
	});
	const crossMaster = await callback({ state: await stateFor({ org }) });
	expectFailure({ url: crossMaster, error: "account_already_connected" });
	expect(crossMaster.searchParams.has("connected_org_slug")).toBe(false);
	expect(crossMaster.searchParams.has("connected_org_name")).toBe(false);
	const saved = await OrgService.get({ db, orgId: org.id });
	expect(saved.test_stripe_connect?.account_id).toBeUndefined();
});

test("OAuth callback rejects platform state after target ownership changes", async () => {
	const org = await createOrg();
	const state = await stateFor({ org });
	await OrgService.update({
		db,
		orgId: org.id,
		updates: { created_by: "org_new_master" },
	});
	expectFailure({ url: await callback({ state }), error: "org_not_found" });
	expect(token).not.toHaveBeenCalled();
});

test("OAuth callback preserves secret-key mismatch checks and their failure redirects", async () => {
	const org = await createOrg();
	const account = await stripe.accounts.retrieve();
	token.mockResolvedValue({
		stripe_user_id: "acct_different_callback_account",
	});
	await OrgService.update({
		db,
		orgId: org.id,
		updates: {
			stripe_config: {
				test_api_key: encryptData(process.env.STRIPE_SANDBOX_SECRET_KEY!),
			},
		},
	});
	const mismatch = await callback({
		state: await stateFor({ org, master: null }),
	});
	expectFailure({ url: mismatch, error: "account_mismatch" });
	expect(mismatch.searchParams.get("secret_key_account_id")).toBe(account.id);
	await OrgService.update({
		db,
		orgId: org.id,
		updates: { stripe_config: { test_api_key: "invalid_encrypted_key" } },
	});
	expectFailure({
		url: await callback({ state: await stateFor({ org }) }),
		error: "account_mismatch_check_failed",
	});
	const saved = await OrgService.get({ db, orgId: org.id });
	expect(saved.test_stripe_connect?.account_id).toBeUndefined();
});

test("OAuth callback does not persist an account whose exchanged authorization was revoked", async () => {
	const org = await createOrg();
	const account = await stripe.accounts.create({
		type: "standard",
		country: "US",
	});
	token.mockResolvedValue({ stripe_user_id: account.id });
	await stripe.oauth.deauthorize({
		client_id: process.env.STRIPE_SANDBOX_CLIENT_ID!,
		stripe_user_id: account.id,
	});
	expectFailure({
		url: await callback({ state: await stateFor({ org }) }),
		error: "oauth_callback_failed",
	});
	const saved = await OrgService.get({ db, orgId: org.id });
	expect(saved.test_stripe_connect?.account_id).toBeUndefined();
});
