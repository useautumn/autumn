/**
 * TDD test for cache warmer happy path.
 *
 * Contract under test:
 *   Allowlist:
 *     - "cache-warmer-feature-test-cus" is on WARM_CACHE_CUSTOMER_IDS so
 *       attempts to warm this customer are NOT short-circuited.
 *   New behaviors:
 *     - runWarmFullSubjectCache({ ctx, customerId }) populates the
 *       FullSubject cache for the customer AND every entity owned by
 *       the customer, given a previously-invalidated cache.
 *     - Returns { warmed_customer: 1, warmed_entities: N, total_entities: N }
 *       when both the customer and all N entities hydrate cleanly.
 *     - Between entity batches the warmer pauses BATCH_PAUSE_MS so a
 *       large entity fan-out does not burst DB+Redis. (Asserted
 *       indirectly via the total entity count, not on timing.)
 *   Side effects:
 *     - Redis key at buildFullSubjectKey({ customerId }) is populated.
 *     - Redis key at buildFullSubjectKey({ customerId, entityId }) is
 *       populated for each of the customer's 5 entities.
 *
 * Pre-impl red: this file did not exist; the warmer body lived inside
 *   the trigger.dev task wrapper and could not be invoked directly.
 * Post-impl green: runWarmFullSubjectCache is exported from
 *   warmFullSubjectCacheTask.ts and writes the expected Redis keys.
 */

import { expect, test } from "bun:test";
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

test(
	`${chalk.yellowBright("cache warmer: hydrates customer + every entity after invalidation")}`,
	async () => {
		// Must match the entry added to WARM_CACHE_CUSTOMER_IDS in
		// server/src/internal/customers/cache/fullSubject/actions/warmFullSubjectCache.ts.
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

		// Start from a clean cache so the warm's effects are unambiguous.
		// The attach above does this via refreshCacheMiddleware, but a
		// concurrent read could have re-populated the entry; force it.
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

		// ── Pre-condition: cache is empty for customer + all 5 entities ──────────
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

		// ── Behavior under test: warm the cache ──────────────────────────────────
		const result = await runWarmFullSubjectCache({
			ctx,
			customerId,
			source: "integration-test",
		});

		// ── Contract assertion 1: return value reflects what was warmed ──────────
		expect(result.warmed_customer).toBe(1);
		expect(result.total_entities).toBe(5);
		expect(result.warmed_entities).toBe(5);

		// ── Contract assertion 2: customer-level cache key is populated ──────────
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

		// ── Contract assertion 3: each entity cache key is populated ─────────────
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
