/**
 * TDD regression for concurrent cold-cache checks hydrating the same partial
 * FullSubject independently.
 *
 * Red-failure mode (before fix):
 *  - Identical concurrent checks entered the FullSubject DB gate separately.
 *  - Under a one-active/one-pending gate, excess requests failed open instead
 *    of returning their real balance.
 *
 * Green-success criteria (after fix):
 *  - Identical in-process checks share one cold-cache hydration.
 *  - Every request returns real check data and the correct balance.
 *  - The hydrated FullSubject is written to Redis.
 */

import { afterAll, expect, test } from "bun:test";
import { ParsedCheckParamsSchema } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { primeRedisV2Monitor } from "@/external/redis/initUtils/redisV2Availability.js";
import { runCheckWithRollout } from "@/internal/balances/check/runCheckWithRollout.js";
import {
	getCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { _setFullSubjectGateConfigForTesting } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";

const CONCURRENCY = 8;

_setFullSubjectGateConfigForTesting({
	config: {
		per_customer_limit: 1,
		per_org_limit: 1,
		max_wait_ms: 100,
		per_customer_pending_max: 1,
		per_org_pending_max: 1,
	},
});

afterAll(() => {
	_setFullSubjectGateConfigForTesting({ config: {} });
});

await primeRedisV2Monitor();

test("identical concurrent cold-cache checks share one real hydration", async () => {
	const customerId = "partial-full-subject-single-flight";
	const freeProduct = products.base({
		id: "partial-full-subject-single-flight-free",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { ctx } = await initScenario({
		customerId,
		setup: [
			s.deleteCustomer({ customerId }),
			s.customer({ testClock: false }),
			s.products({ list: [freeProduct] }),
		],
		actions: [s.attach({ productId: freeProduct.id })],
	});

	ctx.rolloutSnapshot = {
		rolloutId: "v2-cache",
		enabled: true,
		percent: 100,
		previousPercent: 100,
		changedAt: 0,
		customerBucket: 0,
	};
	ctx.customerId = customerId;

	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "partial-full-subject-single-flight-test",
	});

	const body = ParsedCheckParamsSchema.parse({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const results = await Promise.all(
		Array.from({ length: CONCURRENCY }, () =>
			runCheckWithRollout({
				ctx,
				body,
				requiredBalance: 1,
			}),
		),
	);

	for (const result of results) {
		expect(result.checkData).not.toBeNull();
		expect(result.response).toMatchObject({
			allowed: true,
			balance: {
				remaining: 1000,
			},
		});
	}

	const cached = await getCachedFullSubject({
		ctx,
		customerId,
		source: "partial-full-subject-single-flight-test:assert",
	});
	expect(cached.fullSubject).toBeDefined();
});
