import { afterAll, describe, expect, test } from "bun:test";
import { type FullCustomer, FullCustomerSchema } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { z } from "zod/v4";
import { repairCachedProductCollections } from "@/internal/customers/cache/repairCachedProductCollections.js";
import { normalizeFromSchema } from "@/utils/cacheUtils/normalizeFromSchema.js";

const describeRedis = process.env.TESTS_ORG ? describe : describe.skip;

// Proves a malformed product.metadata survives a real Redis round-trip and is
// repaired to {} by getCachedFullCustomer's read pipeline (normalizer + the
// shared safeguard). We replay that pipeline directly because invoking
// getCachedFullCustomer needs a real persisted customer (it lazily resets
// entitlements) and reads via RedisJSON.
describeRedis("cached product.metadata repair (redis round-trip)", () => {
	const key = "test:plan-metadata-cache-repair";

	afterAll(async () => {
		await ctx.redisV2.del(key);
	});

	test(`${chalk.yellowBright("metadata [] and missing both repair to {} via redis")}`, async () => {
		const malformed = {
			customer_products: [
				{ product: { id: "p_cjson_collapsed", metadata: [] } },
				{ product: { id: "p_pre_release" } },
			],
		};

		await ctx.redisV2.set(key, JSON.stringify(malformed));
		const raw = await ctx.redisV2.get(key);
		expect(raw).toBeTruthy();

		const fullCustomer = normalizeFromSchema<FullCustomer>({
			schema: FullCustomerSchema as unknown as z.ZodTypeAny,
			data: JSON.parse(raw as string),
		});
		for (const cusProduct of fullCustomer.customer_products ?? []) {
			if (cusProduct.product) {
				repairCachedProductCollections(cusProduct.product);
			}
		}

		expect(fullCustomer.customer_products?.[0]?.product?.metadata).toEqual({});
		expect(fullCustomer.customer_products?.[1]?.product?.metadata).toEqual({});
	});
});
