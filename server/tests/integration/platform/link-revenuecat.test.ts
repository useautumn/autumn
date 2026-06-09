/**
 * Integration coverage for the platform RevenueCat link flow against the live
 * server (atmn-srv on :8080).
 *
 * `POST /v1/platform.link_revenuecat` makes NO RevenueCat HTTP call — it only
 * builds the authorize URL and writes OAuth state to Redis — so the request
 * half is fully testable here. The callback's happy path (real token exchange +
 * project creation) needs a real OAuth code and stays unit-tested; only its
 * deterministic guard branches (which return before any RC call) are exercised.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import defaultCtx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	consumeOAuthState,
	generateOAuthState,
} from "@/internal/platform/platformBeta/utils/oauthStateUtils.js";

const SERVER_BASE = (
	process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

const REDIRECT_URL = "https://platform.example.com/callback/revenuecat";
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

let subCtx: TestContext;
let bareSlug: string;
let masterAutumn: AutumnInt;

beforeAll(async () => {
	const { ctx } = await initScenario({
		setup: [s.platform.create({})],
		actions: [],
	});
	subCtx = ctx;
	// Must pass the bare slug: validatePlatformOrg re-appends `|<masterOrgId>`.
	bareSlug = ctx.org.slug.split("|")[0];
	masterAutumn = new AutumnInt({ secretKey: defaultCtx.orgSecretKey });
}, 120_000);

describe("POST /v1/platform.link_revenuecat", () => {
	test("returns an RC authorize URL and persists the OAuth state", async () => {
		const projectName = `atmn-it-${Math.random().toString(36).slice(2, 8)}`;

		const res = (await masterAutumn.post("/platform.link_revenuecat", {
			organization_slug: bareSlug,
			env: "test",
			project_name: projectName,
			redirect_url: REDIRECT_URL,
		})) as { oauth_url: string };

		expect(
			res.oauth_url.startsWith("https://api.revenuecat.com/oauth2/authorize"),
		).toBe(true);

		const url = new URL(res.oauth_url);
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("client_id")).toBeTruthy();
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("scope")).toBeTruthy();

		const stateKey = url.searchParams.get("state");
		expect(stateKey).toBeTruthy();

		// State was written by the server into the shared Redis; read it back.
		const state = await consumeOAuthState({ stateKey: stateKey as string });
		expect(state).not.toBeNull();
		expect(state?.env).toBe(AppEnv.Sandbox);
		expect(state?.master_org_id).toBe(defaultCtx.org.id);
		expect(state?.provider).toBe("revenuecat");
		expect(state?.revenuecat_project_name).toBe(projectName);
		expect(state?.redirect_uri).toBe(REDIRECT_URL);
		expect(state?.organization_slug).toBe(subCtx.org.slug);
	});

	test("rejects when RevenueCat is already linked for the env", async () => {
		// Mark the LIVE env linked, keeping sandbox free so this is order-independent.
		await OrgService.update({
			db: subCtx.db,
			orgId: subCtx.org.id,
			updates: {
				processor_configs: {
					...subCtx.org.processor_configs,
					revenuecat: {
						...(subCtx.org.processor_configs?.revenuecat ?? {}),
						oauth: {
							access_token: "enc",
							refresh_token: "enc",
							expires_at: Date.now() + 3_600_000,
						},
					},
				},
			},
		});

		await expect(
			masterAutumn.post("/platform.link_revenuecat", {
				organization_slug: bareSlug,
				env: "live",
				project_name: "Already Linked",
				redirect_url: REDIRECT_URL,
			}),
		).rejects.toThrow();
	});

	test("rejects an org not owned by the master org", async () => {
		await expect(
			masterAutumn.post("/platform.link_revenuecat", {
				organization_slug: `atmn-it-missing-${Math.random().toString(36).slice(2, 8)}`,
				env: "sandbox",
				project_name: "Orphan",
				redirect_url: REDIRECT_URL,
			}),
		).rejects.toThrow();
	});
});

describe("GET /revenuecat/oauth_callback (guard branches)", () => {
	test("redirects with error=invalid_state for an unknown state", async () => {
		const res = await fetch(
			`${SERVER_BASE}/revenuecat/oauth_callback?code=x&state=missing-${Math.random().toString(36).slice(2)}`,
			{ redirect: "manual" },
		);

		expect(REDIRECT_STATUSES).toContain(res.status);
		expect(res.headers.get("location") ?? "").toContain("error=invalid_state");
	});

	test("platform flow: redirects org_permission_denied when master_org_id mismatches", async () => {
		// Real state, but a master_org_id that does not own subCtx's org → the
		// callback returns at the permission check, before any RevenueCat call.
		const stateKey = await generateOAuthState({
			organizationSlug: subCtx.org.slug,
			env: AppEnv.Sandbox,
			redirectUri: REDIRECT_URL,
			masterOrgId: "org_not_the_owner",
			codeVerifier: "test-verifier",
			provider: "revenuecat",
			revenuecatProjectName: "Mismatch Project",
		});

		const res = await fetch(
			`${SERVER_BASE}/revenuecat/oauth_callback?code=x&state=${stateKey}`,
			{ redirect: "manual" },
		);

		expect(REDIRECT_STATUSES).toContain(res.status);
		const location = res.headers.get("location") ?? "";
		expect(location).toContain("success=false");
		expect(location).toContain("provider=revenuecat");
		expect(location).toContain("message=org_permission_denied");
	});
});
