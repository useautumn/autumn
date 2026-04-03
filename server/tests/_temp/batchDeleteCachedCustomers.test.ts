import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { redis } from "@/external/redis/initRedis.js";
import { buildPathIndexKey } from "@/internal/customers/cache/pathIndex/pathIndexConfig.js";
import { batchDeleteCachedCustomers } from "@/internal/customers/cusUtils/apiCusCacheUtils/batchDeleteCachedCustomers.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

test.concurrent(`${chalk.yellowBright("batchDeleteCachedCustomers: clears full customer cache + path index after V2 get")}`, async () => {
	test.skipIf(redis.status !== "ready");

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const freeProd = products.base({ id: "free", items: [messagesItem] });
	const otherCustomerLabel = "batch-del-cache-other";

	const { customerId, autumnV2, ctx, otherCustomers } = await initScenario({
		customerId: "batch-del-cache-primary",
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeProd] }),
			s.otherCustomers([{ id: otherCustomerLabel, paymentMethod: "success" }]),
		],
		actions: [
			s.attach({ productId: freeProd.id }),
			s.attach({
				productId: freeProd.id,
				customerId: otherCustomerLabel,
			}),
		],
	});

	const otherEntry = otherCustomers.get(otherCustomerLabel);
	if (!otherEntry) throw new Error("other customer not initialized");

	await autumnV2.customers.get<ApiCustomer>(customerId);
	await autumnV2.customers.get<ApiCustomer>(otherEntry.id);

	const orgId = ctx.org.id;
	const env = ctx.env;

	const primaryFullKey = buildFullCustomerCacheKey({
		orgId,
		env,
		customerId,
	});
	const otherFullKey = buildFullCustomerCacheKey({
		orgId,
		env,
		customerId: otherEntry.id,
	});
	const primaryPathKey = buildPathIndexKey({
		orgId,
		env,
		customerId,
	});
	const otherPathKey = buildPathIndexKey({
		orgId,
		env,
		customerId: otherEntry.id,
	});

	expect(await redis.call("EXISTS", primaryFullKey)).toBe(1);
	expect(await redis.call("EXISTS", otherFullKey)).toBe(1);
	expect(await redis.call("EXISTS", primaryPathKey)).toBe(1);
	expect(await redis.call("EXISTS", otherPathKey)).toBe(1);

	await batchDeleteCachedCustomers({
		customers: [
			{ orgId, env, customerId },
			{ orgId, env, customerId: otherEntry.id },
		],
	});

	expect(await redis.call("EXISTS", primaryFullKey)).toBe(0);
	expect(await redis.call("EXISTS", otherFullKey)).toBe(0);
	expect(await redis.call("EXISTS", primaryPathKey)).toBe(0);
	expect(await redis.call("EXISTS", otherPathKey)).toBe(0);

	const primaryFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(primaryFromDb.balances[TestFeature.Messages]).toBeDefined();
});
