import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { buildCustomerJwtAuthCacheKey } from "@/external/redis/actions/customerJwtAuthCache/customerJwtAuthCache.js";
import { buildStripeWebhookEventKey } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js";
import {
	buildSecretKeyCacheKey,
	SECRET_KEY_CACHE_TTL_SECONDS,
} from "@/internal/dev/apiKeys/cacheApiKeyUtils.js";
import {
	buildIdempotencyStorageKey,
	IDEMPOTENCY_TTL_MS,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";
import {
	buildOrgWithFeaturesCacheKey,
	ORG_WITH_FEATURES_CACHE_TTL_SECONDS,
} from "@/internal/orgs/orgUtils/cacheOrgWithFeatures.js";
import {
	buildAllVersionsProductsCacheKey,
	buildProductsCacheKey,
	PRODUCTS_CACHE_TTL,
} from "@/internal/products/productCacheUtils.js";

/**
 * Pins the EXACT key format (and TTL, where exported) of every misc-cache key
 * family. An accidental key change during the actions/ consolidation is an
 * invisible full cache wipe for that family — this test turns it into a red
 * build instead. Extend as inline key builders get extracted per family; keys
 * here may only change deliberately, with a migration story.
 */
describe("misc redis key formats", () => {
	test("secret key verification", () => {
		expect(buildSecretKeyCacheKey("abc123hash")).toBe("secret_key:abc123hash");
		expect(SECRET_KEY_CACHE_TTL_SECONDS).toBe(3600);
	});

	test("org with features", () => {
		expect(
			buildOrgWithFeaturesCacheKey({ orgId: "org_1", env: AppEnv.Live }),
		).toBe("org_with_features:org_1:live");
		expect(ORG_WITH_FEATURES_CACHE_TTL_SECONDS).toBe(60);
	});

	test("products", () => {
		expect(buildProductsCacheKey({ orgId: "org_1", env: AppEnv.Live })).toBe(
			"products_full:{org_1}:live:1.1.0:default",
		);
		expect(
			buildProductsCacheKey({
				orgId: "org_1",
				env: AppEnv.Live,
				queryParams: { archived: true },
			}),
		).toMatch(/^products_full:\{org_1\}:live:1\.1\.0:/);
		expect(
			buildAllVersionsProductsCacheKey({ orgId: "org_1", env: AppEnv.Live }),
		).toBe("products_full:{org_1}:live:1.1.0:all_versions");
		expect(PRODUCTS_CACHE_TTL).toBe(86400);
	});

	test("customer JWT auth", () => {
		expect(buildCustomerJwtAuthCacheKey("icus_1")).toBe("cjwt_auth:icus_1");
	});

	test("idempotency storage", () => {
		const { storageKey, hashedKey } = buildIdempotencyStorageKey({
			orgId: "org_1",
			env: "live",
			idempotencyKey: "idem_1",
		});
		expect(storageKey).toBe(`org_1:live:idempotency:${hashedKey}`);
		expect(IDEMPOTENCY_TTL_MS).toBe(24 * 60 * 60 * 1000);
	});

	test("stripe webhook idempotency", () => {
		expect(
			buildStripeWebhookEventKey({
				orgId: "org_1",
				env: AppEnv.Live,
				eventId: "evt_1",
			}),
		).toBe("stripe:webhook:org_1:live:evt_1");
	});

	// Inline key builders — pinned here as literals until their family unit
	// extracts an exported builder into external/redis/actions/:
	test("families still built inline (formats documented, not yet importable)", () => {
		const inlineFormats = {
			checkout: "checkout:<checkoutId>",
			expiredCusProducts: "expired-cus-products:<stripeSubscriptionId>",
			savedViews: "saved_views:<orgId>:<env>:<viewId>",
			savedViewsList: "saved_views_list:<orgId>:<env>",
			trmnlDevice: "trmnl:device:<deviceId>",
			trmnlOrg: "trmnl:org:<orgId>",
			modelPricing: "models_dev_pricing",
			modelPricingStale: "models_dev_pricing_stale",
			migrationCancel: "migration_run_cancel:<migrationRunId>",
			oauthState: "oauth_state:<stateKey>",
			autoTopupPending:
				"auto_topup:pending:<orgId>:<env>:<customerId>:<featureId>",
			autoTopupFailedWebhook:
				"auto_topup_failed_webhook:<orgId>:<env>:<customerId>:<featureId>:<reason>:<window>",
		};
		expect(Object.keys(inlineFormats).length).toBe(12);
	});
});
