import { afterAll, expect, test } from "bun:test";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import {
	buildFullSubjectKey,
	getCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { runWarmFullSubjectCache } from "@/trigger/cache/warmFullSubjectCacheTask.js";

const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";

afterAll(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

test(
	`${chalk.yellowBright("cache warmer: hydrates customer + every entity after invalidation")}`,
	async () => {
		const customerId = "cache-warmer-feature-test-cus";

		const free = products.base({
			id: "warm-free",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});
		const pro = products.pro({
			id: "warm-pro",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({ count: 5, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: free.id, entityIndex: 0 }),
				s.attach({ productId: free.id, entityIndex: 1 }),
				s.attach({ productId: free.id, entityIndex: 2 }),
				s.attach({ productId: free.id, entityIndex: 3 }),
				s.attach({ productId: free.id, entityIndex: 4 }),
				s.attach({ productId: pro.id }),
			],
		});

		expect(entities).toHaveLength(5);

		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "integration-test:cache-warmer",
		});
		for (const entity of entities) {
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				entityId: entity.id,
				source: "integration-test:cache-warmer",
			});
		}

		const customerCachePre = await getCachedFullSubject({
			ctx,
			customerId,
			source: "integration-test:cache-warmer-pre",
		});
		expect(customerCachePre.fullSubject).toBeUndefined();

		for (const entity of entities) {
			const entityCachePre = await getCachedFullSubject({
				ctx,
				customerId,
				entityId: entity.id,
				source: "integration-test:cache-warmer-pre",
			});
			expect(entityCachePre.fullSubject).toBeUndefined();
		}

		const result = await runWarmFullSubjectCache({
			ctx,
			customerId,
			source: "integration-test",
		});

		expect(result.warmed_customer).toBe(1);
		expect(result.total_entities).toBe(5);
		expect(result.warmed_entities).toBe(5);

		const customerCachePost = await getCachedFullSubject({
			ctx,
			customerId,
			source: "integration-test:cache-warmer-post",
		});
		expect(customerCachePost.fullSubject).toBeDefined();

		const customerSubjectKey = buildFullSubjectKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		});
		expect(await ctx.redisV2.exists(customerSubjectKey)).toBe(1);

		for (const entity of entities) {
			const entityCachePost = await getCachedFullSubject({
				ctx,
				customerId,
				entityId: entity.id,
				source: "integration-test:cache-warmer-post",
			});
			expect(entityCachePost.fullSubject).toBeDefined();

			const entitySubjectKey = buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				entityId: entity.id,
			});
			expect(await ctx.redisV2.exists(entitySubjectKey)).toBe(1);
		}
	},
);
