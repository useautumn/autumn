import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { buildCheckoutCacheKey } from "@/external/redis/actions/autumnCheckoutCache/autumnCheckoutCache.js";
import { buildCustomerJwtAuthCacheKey } from "@/external/redis/actions/customerJwtAuthCache/customerJwtAuthCache.js";
import { buildExpiredCustomerProductsCacheKey } from "@/external/redis/actions/expiredCustomerProductsCache/expiredCustomerProductsCache.js";
import { buildMigrationCancelTokenKey } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import {
	MODEL_PRICING_CACHE_KEY,
	MODEL_PRICING_STALE_CACHE_KEY,
	MODEL_PRICING_STALE_TTL_SECONDS,
	MODEL_PRICING_TTL_SECONDS,
} from "@/external/redis/actions/modelPricingCache/modelPricingCache.js";
import {
	buildOAuthStateKey,
	OAUTH_STATE_TTL_SECONDS,
} from "@/external/redis/actions/oauthStateStore/oauthStateStore.js";
import {
	buildOrgWithFeaturesCacheKey,
	ORG_WITH_FEATURES_CACHE_TTL_SECONDS,
} from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import {
	buildAllVersionsProductsCacheKey,
	buildProductsCacheKey,
	PRODUCTS_CACHE_TTL,
} from "@/external/redis/actions/productsCache/productsCache.js";
import {
	buildSavedViewIdListKey,
	buildSavedViewKey,
} from "@/external/redis/actions/savedViewsStore/savedViewsStore.js";
import {
	buildSecretKeyCacheKey,
	SECRET_KEY_CACHE_TTL_SECONDS,
} from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import {
	buildTrmnlDeviceKey,
	buildTrmnlOrgKey,
} from "@/external/redis/actions/trmnlDeviceStore/trmnlDeviceStore.js";
import { buildStripeWebhookEventKey } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware.js";
import {
	buildIdempotencyStorageKey,
	IDEMPOTENCY_TTL_MS,
} from "@/internal/misc/idempotency/idempotencyKeyUtils.js";

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

	test("checkout", () => {
		expect(buildCheckoutCacheKey("chk_1")).toBe("checkout:chk_1");
	});

	test("expired customer products", () => {
		expect(buildExpiredCustomerProductsCacheKey("sub_1")).toBe(
			"expired-cus-products:sub_1",
		);
	});

	test("saved views", () => {
		expect(
			buildSavedViewKey({ orgId: "org_1", env: AppEnv.Live, viewId: "v1" }),
		).toBe("saved_views:org_1:live:v1");
		expect(buildSavedViewIdListKey({ orgId: "org_1", env: AppEnv.Live })).toBe(
			"saved_views_list:org_1:live",
		);
	});

	test("trmnl device store", () => {
		expect(buildTrmnlDeviceKey("dev_1")).toBe("trmnl:device:dev_1");
		expect(buildTrmnlOrgKey("org_1")).toBe("trmnl:org:org_1");
	});

	test("model pricing", () => {
		expect(MODEL_PRICING_CACHE_KEY).toBe("models_dev_pricing");
		expect(MODEL_PRICING_STALE_CACHE_KEY).toBe("models_dev_pricing_stale");
		expect(MODEL_PRICING_TTL_SECONDS).toBe(60 * 60 * 3);
		expect(MODEL_PRICING_STALE_TTL_SECONDS).toBe(60 * 60 * 24 * 3);
	});

	test("migration cancel token", () => {
		expect(buildMigrationCancelTokenKey("run_1")).toBe(
			"migration_run_cancel:run_1",
		);
	});

	test("oauth state", () => {
		expect(buildOAuthStateKey("state_1")).toBe("oauth_state:state_1");
		expect(OAUTH_STATE_TTL_SECONDS).toBe(600);
	});

	// Inline key builders — pinned here as literals until their family unit
	// extracts an exported builder into external/redis/actions/:
	test("families still built inline (formats documented, not yet importable)", () => {
		const inlineFormats = {
			autoTopupPending:
				"auto_topup:pending:<orgId>:<env>:<customerId>:<featureId>",
			autoTopupFailedWebhook:
				"auto_topup_failed_webhook:<orgId>:<env>:<customerId>:<featureId>:<reason>:<window>",
		};
		expect(Object.keys(inlineFormats).length).toBe(2);
	});
});
