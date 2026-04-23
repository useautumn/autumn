import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { redis } from "@/external/redis/initRedis.js";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { batchDeleteCachedFullCustomers } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/batchDeleteCachedFullCustomers.js";

test.concurrent(`${chalk.yellowBright("batchDeleteCachedFullCustomers: leaves full-subject cache untouched after V2 get")}`, async () => {
	test.skipIf(redis.status !== "ready");
	test.skipIf(redisV2.status !== "ready");

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

	const primarySubjectKey = buildFullSubjectKey({
		orgId,
		env,
		customerId,
	});
	const otherSubjectKey = buildFullSubjectKey({
		orgId,
		env,
		customerId: otherEntry.id,
	});
	const sharedBalanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId,
		featureId: TestFeature.Messages,
	});
	const otherSharedBalanceKey = buildSharedFullSubjectBalanceKey({
		orgId,
		env,
		customerId: otherEntry.id,
		featureId: TestFeature.Messages,
	});

	expect(await ctx.redisV2.exists(primarySubjectKey)).toBe(1);
	expect(await ctx.redisV2.exists(otherSubjectKey)).toBe(1);
	expect(await ctx.redisV2.exists(sharedBalanceKey)).toBe(1);
	expect(await ctx.redisV2.exists(otherSharedBalanceKey)).toBe(1);

	await ctx.redisV2.unlink(otherSubjectKey);

	await batchDeleteCachedFullCustomers({
		customers: [
			{ orgId, env, customerId },
			{ orgId, env, customerId: otherEntry.id },
		],
	});

	expect(await ctx.redisV2.exists(primarySubjectKey)).toBe(1);
	expect(await ctx.redisV2.exists(otherSubjectKey)).toBe(0);
	expect(await ctx.redisV2.exists(sharedBalanceKey)).toBe(1);
	expect(await ctx.redisV2.exists(otherSharedBalanceKey)).toBe(1);

	const primaryFromDb = await autumnV2.customers.get<ApiCustomer>(customerId, {
		skip_cache: "true",
	});
	expect(primaryFromDb.balances[TestFeature.Messages]).toBeDefined();
});
