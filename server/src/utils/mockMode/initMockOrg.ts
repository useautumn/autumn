import { AppEnv, type Feature, type Organization } from "@autumn/shared";
import { db } from "@/db/initDrizzle.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createSvixApp } from "@/external/svix/svixHelpers.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createConnectAccount } from "@/internal/orgs/orgUtils/createConnectAccount.js";
import { generatePublishableKey } from "@/utils/encryptUtils.js";

export const MOCK_ORG_ID = "mock_test_org";
export const MOCK_ORG_SLUG = "mock-test-org";
export const MOCK_ORG_NAME = "Mock Test Org";

const MOCK_USER = {
	id: "mock_test_user",
	email: "mock@test.local",
	name: "Mock Test User",
	emailVerified: true,
	createdAt: new Date(),
	updatedAt: new Date(),
};

let cachedMockOrg: { org: Organization; features: Feature[] } | null = null;

/**
 * Returns the cached mock org context (org + sandbox features).
 * Call initMockOrg() first to ensure it is populated.
 */
export const getMockOrgContext = () => cachedMockOrg;

/**
 * Ensures the mock org exists in the DB and is fully ready.
 * If STRIPE_SANDBOX_SECRET_KEY is present, creates a real Stripe Connect account.
 * If SVIX_API_KEY is present, creates real Svix apps (safeSvix already guards this).
 * All external calls are optional — the sandbox works without them.
 * Idempotent — safe to call multiple times.
 */
export const initMockOrg = async () => {
	logger.info("[mock] Initialising mock org...");

	// Check if already exists
	const existing = await OrgService.getWithFeatures({
		db,
		orgId: MOCK_ORG_ID,
		env: AppEnv.Sandbox,
		allowNotFound: true,
	});

	if (existing) {
		logger.info(
			`[mock] Mock org already exists (${MOCK_ORG_ID}), skipping creation`,
		);
		cachedMockOrg = existing;
		return existing;
	}

	logger.info("[mock] Creating mock org in DB...");

	// Insert the org row
	await OrgService.create({
		db,
		id: MOCK_ORG_ID,
		slug: MOCK_ORG_SLUG,
		name: MOCK_ORG_NAME,
	});

	// ── Stripe Connect ────────────────────────────────────────────────────────
	let testStripeConnect: Record<string, string> = {};
	if (process.env.STRIPE_SANDBOX_SECRET_KEY) {
		logger.info(
			"[mock] STRIPE_SANDBOX_SECRET_KEY detected — creating Stripe Connect account...",
		);
		try {
			const account = await createConnectAccount({
				org: {
					id: MOCK_ORG_ID,
					slug: MOCK_ORG_SLUG,
					name: MOCK_ORG_NAME,
					createdAt: new Date(),
				},
				user: MOCK_USER as any,
			});
			testStripeConnect = { default_account_id: account.id };
			logger.info(`[mock] Stripe Connect account created: ${account.id}`);
		} catch (err: any) {
			logger.warn(
				`[mock] Stripe Connect creation failed (skipping): ${err?.message}`,
			);
		}
	} else {
		logger.info(
			"[mock] No STRIPE_SANDBOX_SECRET_KEY — skipping Stripe Connect",
		);
	}

	// ── Svix webhook apps ─────────────────────────────────────────────────────
	// createSvixApp is wrapped in safeSvix which returns undefined when
	// SVIX_API_KEY is not set, so this is safe to call unconditionally.
	let svixConfig = { sandbox_app_id: "", live_app_id: "" };
	if (process.env.SVIX_API_KEY) {
		logger.info("[mock] SVIX_API_KEY detected — creating Svix apps...");
		try {
			const [sandboxApp, liveApp] = await Promise.all([
				createSvixApp({
					name: `${MOCK_ORG_SLUG}_${AppEnv.Sandbox}`,
					orgId: MOCK_ORG_ID,
					env: AppEnv.Sandbox,
				}),
				createSvixApp({
					name: `${MOCK_ORG_SLUG}_${AppEnv.Live}`,
					orgId: MOCK_ORG_ID,
					env: AppEnv.Live,
				}),
			]);
			svixConfig = {
				sandbox_app_id: sandboxApp?.id ?? "",
				live_app_id: liveApp?.id ?? "",
			};
			logger.info(
				`[mock] Svix apps created (sandbox=${svixConfig.sandbox_app_id}, live=${svixConfig.live_app_id})`,
			);
		} catch (err: any) {
			logger.warn(
				`[mock] Svix app creation failed (skipping): ${err?.message}`,
			);
		}
	} else {
		logger.info("[mock] No SVIX_API_KEY — skipping Svix apps");
	}

	// ── Persist everything ────────────────────────────────────────────────────
	await OrgService.update({
		db,
		orgId: MOCK_ORG_ID,
		updates: {
			created_at: Date.now(),
			default_currency: "usd",
			test_pkey: generatePublishableKey(AppEnv.Sandbox),
			live_pkey: generatePublishableKey(AppEnv.Live),
			svix_config: svixConfig,
			test_stripe_connect: testStripeConnect,
		},
	});

	const result = await OrgService.getWithFeatures({
		db,
		orgId: MOCK_ORG_ID,
		env: AppEnv.Sandbox,
	});

	cachedMockOrg = result;
	logger.info(`[mock] Mock org ready (${MOCK_ORG_ID})`);
	return result;
};
