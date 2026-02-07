/**
 * One-Off Customer Product Cleanup Tests - Edge Cases
 *
 * Tests for scenarios with specific edge cases that the cleanup cron job
 * must handle correctly.
 *
 * Edge cases covered:
 * - Unlimited features (never "depleted" - has no balance concept)
 * - Entity-specific isolation (same product on different entities don't affect each other)
 * - Multiple boolean features where newer product is missing some
 */

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { cleanupOneOffCustomerProducts } from "@/internal/customers/cusProducts/actions/cleanupOneOff/cleanupOneOff.js";
import {
	expectProductStatusesByOrder,
	getFullCustomerWithExpired,
} from "./utils/oneOffCleanupTestUtils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Unlimited feature - can never be "depleted"
// Product with unlimited: true has no balance concept, so it should never qualify for cleanup
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: oneoff-unlimited-never-depleted")}`, async () => {
	const customerId = "cleanup-oneoff-unlimited-never-depleted";

	const unlimitedMessagesItem = items.unlimitedMessages();

	const oneOff = products.oneOff({
		id: "one-off-unlimited",
		items: [unlimitedMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first
	await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: oneOff.id },
		{ timeout: 2000 },
	);

	await timeout(2000);

	// Attach second
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: both should stay active (unlimited features can never be "depleted")
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity-specific isolation
// Same product attached to different entities shouldn't affect each other.
// Scenario:
// - Entity 0: attach oneoff → deplete → attach again → deplete
// - Entity 1: attach same oneoff
// Expected: Only FIRST product on Entity 0 should be expired
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: entity-isolation-only-same-entity-expires")}`, async () => {
	const customerId = "cleanup-entity-isolation";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOff = products.oneOff({
		id: "one-off",
		items: [oneOffMessagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Entity 0: Attach first product
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			entity_id: entities[0].id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	// Entity 0: Track first to 0
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		value: 100,
	});

	await timeout(2000);

	// Entity 0: Attach second product
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			entity_id: entities[0].id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	// Entity 0: Track second to 0
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		entity_id: entities[0].id,
		value: 100,
	});

	await timeout(2000);

	// Entity 1: Attach product (different entity)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		entity_id: entities[1].id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: Only the FIRST product on Entity 0 should be expired
	// The second product on Entity 0 stays active (no newer active on same entity)
	// The product on Entity 1 stays active (different entity)
	const fullCus = await getFullCustomerWithExpired(customerId);

	// Get customer products for this product, sorted by created_at
	const cusProducts = fullCus.customer_products
		.filter((cp) => cp.product.id === oneOff.id)
		.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

	// Should have 3 customer products total
	expect(cusProducts.length).toBe(3);

	// First (Entity 0, oldest): Should be expired (depleted + has newer active on same entity)
	expect(cusProducts[0].status).toBe(CusProductStatus.Expired);

	// Second (Entity 0, newer): Should stay active (no newer active product exists for this entity)
	expect(cusProducts[1].status).toBe(CusProductStatus.Active);

	// Third (Entity 1): Should stay active (different entity, isolated)
	expect(cusProducts[2].status).toBe(CusProductStatus.Active);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Multiple boolean features - newer product missing one
// Original has 2 booleans (dashboard + adminRights), newer only has 1.
// The original should stay active because expiring it would lose adminRights.
//
// To test this, we:
// 1. Attach product with both booleans
// 2. Attach same product again
// 3. Delete the adminRights entitlement from the NEWER customer_product
// 4. Run cleanup
// 5. Verify the first stays active (newer is missing adminRights)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: boolean-coverage-newer-missing-feature")}`, async () => {
	const customerId = "cleanup-boolean-coverage-missing";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const dashboardItem = items.dashboard();
	const adminRightsItem = items.adminRights();

	// Product with messages + dashboard + adminRights
	const oneOff = products.oneOff({
		id: "one-off-two-bool",
		items: [oneOffMessagesItem, dashboardItem, adminRightsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first product (with both dashboard + adminRights), deplete messages
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Attach second product (same product, so initially has both booleans)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Simulate product versioning: delete the adminRights entitlement from the NEWER customer_product
	// This simulates a scenario where the product was updated to remove a boolean feature
	// between the two attaches
	const fullCusBefore = await getFullCustomerWithExpired(customerId);
	const cusProducts = fullCusBefore.customer_products
		.filter((cp) => cp.product.id === oneOff.id)
		.sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

	// Get the newer customer_product (second one)
	const newerCusProduct = cusProducts[1];

	// Find the adminRights entitlement in the newer customer_product
	const adminRightsEnt = newerCusProduct.customer_entitlements?.find(
		(ce) => ce.entitlement?.feature?.id === TestFeature.AdminRights,
	);

	if (adminRightsEnt) {
		// Delete the adminRights customer_entitlement from the newer product
		await ctx.db.execute(`
			DELETE FROM customer_entitlements 
			WHERE id = '${adminRightsEnt.id}'
		`);
	}

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: BOTH should stay active
	// First stays active because the newer product is missing adminRights (would lose entitlement)
	// Second stays active because it's the newest
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Active, CusProductStatus.Active],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple boolean features - same product, verify boolean check works
// Attach product with 2 booleans twice, deplete consumables in first.
// This verifies that when newer product HAS all booleans, cleanup proceeds.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("cleanup: boolean-coverage-same-product-all-covered")}`, async () => {
	const customerId = "cleanup-boolean-all-covered";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const dashboardItem = items.dashboard();
	const adminRightsItem = items.adminRights();

	// Product with messages + both boolean features
	const oneOff = products.oneOff({
		id: "one-off-two-booleans",
		items: [oneOffMessagesItem, dashboardItem, adminRightsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	// Attach first, deplete messages
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: oneOff.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
		},
		{ timeout: 2000 },
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 100,
	});

	await timeout(2000);

	// Attach second (same product, so has both dashboard AND adminRights)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: oneOff.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
	});

	await timeout(2000);

	// Run cleanup
	await cleanupOneOffCustomerProducts({ ctx });

	// Verify: first should be expired because newer product has ALL boolean features
	const fullCus = await getFullCustomerWithExpired(customerId);
	expectProductStatusesByOrder({
		fullCus,
		productId: oneOff.id,
		expectedStatuses: [CusProductStatus.Expired, CusProductStatus.Active],
	});
});
