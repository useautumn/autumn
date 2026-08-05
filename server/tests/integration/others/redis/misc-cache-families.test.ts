/**
 * Verification test for the misc-cache families moved to external/redis/actions/
 * (products, org+features, secret key) — proves the moves kept behavior intact.
 *
 * Contract under test:
 *   Products cache:
 *     - ProductService.listFull populates products_full:{org}:<env>:1.1.0:default
 *     - getCachedProducts returns the cached list
 *     - invalidateProductsCache removes every deterministic key variant
 *   Org cache:
 *     - getOrgWithFeaturesCached returns org+features and populates
 *       org_with_features:<org>:<env>
 *     - clearOrgWithFeaturesCache removes it (both envs)
 *   Secret-key cache:
 *     - set → get round-trips the payload; clearSecretKeyCache removes it
 *       (the real verify flow is covered by secret-key-verification.test.ts)
 */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import {
	buildOrgWithFeaturesCacheKey,
	clearOrgWithFeaturesCache,
	getCachedOrgWithFeatures,
} from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import {
	buildAllVersionsProductsCacheKey,
	buildProductsCacheKey,
	getCachedProducts,
	invalidateProductsCache,
} from "@/external/redis/actions/productsCache/productsCache.js";
import {
	buildSecretKeyCacheKey,
	clearSecretKeyCache,
	getCachedSecretKeyVerification,
	setCachedSecretKeyVerification,
} from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import { getMiscRedis } from "@/external/redis/initRedis.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { ProductService } from "@/internal/products/ProductService.js";

const describeWithRedis = process.env.TESTS_ORG ? describe : describe.skip;

describeWithRedis("misc cache families (post actions/ move)", () => {
	test("products: listFull populates the cache, cached read works, invalidate clears every variant", async () => {
		const { db, org, env } = ctx;
		const defaultKey = buildProductsCacheKey({ orgId: org.id, env });

		// ── Contract: listFull populates the default-variant key ─────────
		await invalidateProductsCache({ orgId: org.id, env });
		const fromDb = await ProductService.listFull({ db, orgId: org.id, env });
		expect(await getMiscRedis().exists(defaultKey)).toBe(1);

		// ── Contract: the cached read returns the same list ──────────────
		const cached = await getCachedProducts<typeof fromDb>({
			cacheKey: defaultKey,
		});
		expect(cached).not.toBeNull();
		expect(cached?.length).toBe(fromDb.length);

		// ── Contract: invalidate removes all deterministic variants ──────
		await invalidateProductsCache({ orgId: org.id, env });
		expect(await getMiscRedis().exists(defaultKey)).toBe(0);
		expect(
			await getMiscRedis().exists(
				buildAllVersionsProductsCacheKey({ orgId: org.id, env }),
			),
		).toBe(0);
	});

	test("org: read-through populates the cache and clear removes it", async () => {
		const { db, org, env } = ctx;
		const cacheKey = buildOrgWithFeaturesCacheKey({ orgId: org.id, env });

		// ── Contract: read-through returns org+features and populates ────
		await clearOrgWithFeaturesCache({ orgId: org.id, env });
		const fresh = await getOrgWithFeaturesCached({ db, orgId: org.id, env });
		expect(fresh?.org.id).toBe(org.id);
		expect(Array.isArray(fresh?.features)).toBe(true);
		expect(await getMiscRedis().exists(cacheKey)).toBe(1);

		// ── Contract: cached read returns the same org ───────────────────
		const cached = await getCachedOrgWithFeatures<{ org: { id: string } }>({
			orgId: org.id,
			env,
		});
		expect(cached?.org.id).toBe(org.id);

		// ── Contract: clear removes the entry ────────────────────────────
		await clearOrgWithFeaturesCache({ orgId: org.id, env });
		expect(await getMiscRedis().exists(cacheKey)).toBe(0);
		expect(await getCachedOrgWithFeatures({ orgId: org.id, env })).toBeNull();
	});

	test("secret key: set → get round-trips, clear removes", async () => {
		const hashedKey = `test-hash-${randomUUID()}`;
		const payload = { org: { id: ctx.org.id }, env: ctx.env };

		// ── Contract: set → get round-trip ───────────────────────────────
		await setCachedSecretKeyVerification({ hashedKey, data: payload });
		const cached = await getCachedSecretKeyVerification({ hashedKey });
		expect(cached).toMatchObject(payload);

		// ── Contract: clear removes the entry ────────────────────────────
		await clearSecretKeyCache({ hashedKey });
		expect(await getMiscRedis().exists(buildSecretKeyCacheKey(hashedKey))).toBe(
			0,
		);
		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
	});
});
