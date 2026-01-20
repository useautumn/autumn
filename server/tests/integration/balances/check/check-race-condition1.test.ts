import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { setCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/setCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";

/**
 * Race condition scenario:
 * A. Request 1: Gets up to CusService.insert (customer created, but default products NOT attached yet)
 * B. Request 2: Calls CusService.getFull, finds customer WITHOUT default products, caches it
 * Final state: Cache has customer without default products (stale)
 */
test.concurrent(`${chalk.yellowBright("check-race-condition1: cache should not contain stale customer without default products")}`, async () => {
	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const freeDefault = products.base({
		id: "free",
		items: [wordsItem],
		isDefault: true,
	});

	const customerId = "check-race-condition1";
	const { autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [freeDefault] }),
		],
		actions: [],
	});

	// Delete the customer so we can manually reproduce the race condition
	try {
		await autumnV2.customers.delete(customerId);
	} catch {}

	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test-cleanup",
	});

	// ═══════════════════════════════════════════════════════════════════
	// STEP A: Simulate Request 1 - insert customer WITHOUT default products
	// (This simulates the state after CusService.insert but BEFORE default products are attached)
	// ═══════════════════════════════════════════════════════════════════
	const internalId = generateId("cus");
	await CusService.insert({
		db: ctx.db,
		data: {
			id: customerId,
			internal_id: internalId,
			org_id: ctx.org.id,
			env: ctx.env,
			name: customerId,
			email: `${customerId}@test.com`,
			metadata: {},
			created_at: Date.now(),
			processor: null,
		},
	});

	// ═══════════════════════════════════════════════════════════════════
	// STEP B: Simulate Request 2 - fetch from DB and cache (customer exists but NO default products)
	// This is what happens when a parallel request queries while Request 1 is still attaching products
	// ═══════════════════════════════════════════════════════════════════
	const customerWithoutDefaults = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
		withEntities: true,
		withSubs: true,
	});

	// Cache this incomplete customer (simulating what Request 2 would do)
	await setCachedFullCustomer({
		ctx,
		fullCustomer: customerWithoutDefaults!,
		customerId,
		fetchTimeMs: Date.now(),
		source: "test-request-2",
		overwrite: true,
	});

	// ═══════════════════════════════════════════════════════════════════
	// STEP C: Now call getOrCreateCachedFullCustomer - this should detect the stale cache
	// and return the customer with default products
	// ═══════════════════════════════════════════════════════════════════
	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		params: {
			customer_id: customerId,
			feature_id: TestFeature.Words,
		},
		source: "test-final-check",
	});

	// The customer should have default products attached
	expect(fullCustomer.customer_products?.length).toBeGreaterThan(0);

	// Verify via API (skip cache to get fresh data from DB)
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: "test-verify",
	});

	const customerFromApi = await autumnV2.customers.get<ApiCustomer>(
		customerId,
		{ skip_cache: "true" },
	);

	// Should have the words balance from the default product
	const wordsBalance = customerFromApi.balances?.[TestFeature.Words];
	expect(wordsBalance).toBeDefined();
	expect(wordsBalance?.current_balance).toBe(1000);
});
