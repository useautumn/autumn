import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	buildOrgWithFeaturesCacheKey,
	clearOrgWithFeaturesCache,
	getCachedOrgWithFeatures,
} from "@autumn/cache";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { ProductService } from "@/internal/products/ProductService.js";

const describeWithRedis = process.env.TESTS_ORG ? describe : describe.skip;

describeWithRedis("misc cache families (post actions/ move)", () => {
	test("products: listFull populates the cache, cached read works, invalidate clears every variant", async () => {
		const { db, org, env } = ctx;
		const defaultKey = buildProductsCacheKey({ orgId: org.id, env });

		await invalidateProductsCache({ orgId: org.id, env });
		const fromDb = await ProductService.listFull({ db, orgId: org.id, env });
		expect(await getMiscRedis().exists(defaultKey)).toBe(1);

		const cached = await getCachedProducts<typeof fromDb>({
			cacheKey: defaultKey,
		});
		expect(cached).not.toBeNull();
		expect(cached?.length).toBe(fromDb.length);

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

		await clearOrgWithFeaturesCache({
			ctx: getMiscCacheContext(),
			orgId: org.id,
			env,
		});
		const fresh = await getOrgWithFeaturesCached({ db, orgId: org.id, env });
		expect(fresh?.org.id).toBe(org.id);
		expect(Array.isArray(fresh?.features)).toBe(true);
		expect(await getMiscRedis().exists(cacheKey)).toBe(1);

		const cached = await getCachedOrgWithFeatures<{ org: { id: string } }>({
			ctx: getMiscCacheContext(),
			orgId: org.id,
			env,
		});
		expect(cached?.org.id).toBe(org.id);

		await clearOrgWithFeaturesCache({
			ctx: getMiscCacheContext(),
			orgId: org.id,
			env,
		});
		expect(await getMiscRedis().exists(cacheKey)).toBe(0);
		expect(
			await getCachedOrgWithFeatures({
				ctx: getMiscCacheContext(),
				orgId: org.id,
				env,
			}),
		).toBeNull();
	});

	test("secret key: set → get round-trips, clear removes", async () => {
		const hashedKey = `test-hash-${randomUUID()}`;
		const payload = { org: { id: ctx.org.id }, env: ctx.env };

		await setCachedSecretKeyVerification({ hashedKey, data: payload });
		const cached = await getCachedSecretKeyVerification({ hashedKey });
		expect(cached).toMatchObject(payload);

		await clearSecretKeyCache({ hashedKey });
		expect(await getMiscRedis().exists(buildSecretKeyCacheKey(hashedKey))).toBe(
			0,
		);
		expect(await getCachedSecretKeyVerification({ hashedKey })).toBeNull();
	});
});
