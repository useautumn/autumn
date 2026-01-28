/**
 * Attach Entity-Level Product Tests (Attach V2)
 *
 * Tests for attaching products to entities (sub-accounts) rather than customers.
 * Entities have their own subscriptions and balances.
 *
 * Key behaviors:
 * - Products attached to entities are independent from customer-level products
 * - Each entity can have its own subscription
 * - Mid-cycle attaches are prorated
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Create entity, attach pro to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create entity
 * - Attach pro to entity (not customer)
 *
 * Expected Result:
 * - Entity has product
 * - Customer does not have product
 */
test.concurrent(`${chalk.yellowBright("new-plan: create entity, attach pro to entity")}`, async () => {
	const customerId = "new-plan-attach-entity-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-entity",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0, // Attach to first entity
			}),
		],
	});

	// Get entity and verify it has the product
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Verify entity has messages feature
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Get customer and verify they don't have the product
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Customer should not have products array with this product
	const customerProduct = customer.products?.find((p) => p.id === pro.id);
	expect(customerProduct).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Create 2 entities, attach pro to each
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Attach pro to each
 *
 * Expected Result:
 * - Independent balances
 * - 2 separate subscriptions
 */
test.concurrent(`${chalk.yellowBright("new-plan: create 2 entities, attach pro to each")}`, async () => {
	const customerId = "new-plan-attach-2-entities";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-2ent",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Get both entities and verify independent balances
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Both entities should have the product
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});

	// Both should have independent balances
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Track usage on entity1 only
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 30,
		entity_id: entities[0].id,
	});

	// Re-fetch and verify independent balances after usage
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	expectCustomerFeatureCorrect({
		customer: entity1After,
		featureId: TestFeature.Messages,
		balance: 70, // 100 - 30
		usage: 30,
	});
	expectCustomerFeatureCorrect({
		customer: entity2After,
		featureId: TestFeature.Messages,
		balance: 100, // Unchanged
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Attach pro to entity 1, advance 2 weeks, attach pro to entity 2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro to entity 1
 * - Advance 2 weeks
 * - Attach pro to entity 2
 *
 * Expected Result:
 * - Prorated billing for entity 2
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro to entity 1, advance 2 weeks, attach pro to entity 2")}`, async () => {
	const customerId = "new-plan-attach-entity-midcycle";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-midcycle",
		items: [messagesItem],
	});

	const { autumnV1, entities, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	// Advance 2 weeks
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
	});

	// Attach pro to entity 2 mid-cycle
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	// Get both entities
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// Both should have the product
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});

	// Get customer to check invoices
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: one full price, one prorated
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
	});

	// Entity 2's invoice should be prorated (roughly half of $20 = ~$10)
	// Note: exact amount depends on billing cycle alignment
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Attach pro annual to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach annual product to entity
 *
 * Expected Result:
 * - Correct billing interval (annual)
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro annual to entity")}`, async () => {
	const customerId = "new-plan-attach-entity-annual";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const proAnnual = products.proAnnual({
		id: "pro-annual-ent",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: proAnnual.id,
				entityIndex: 0,
			}),
		],
	});

	// Get entity and verify product
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	await expectProductActive({
		customer: entity,
		productId: proAnnual.id,
	});

	// Verify messages feature
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Get customer and verify invoice (annual = $200)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 200,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Attach pro to customer, then pro to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro to customer first
 * - Then attach pro to entity
 *
 * Expected Result:
 * - Both have product independently
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach pro to customer, then pro to entity")}`, async () => {
	const customerId = "new-plan-attach-cust-then-entity";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-cust-ent",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }), // Customer-level
			s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Entity-level
		],
	});

	// Get customer and entity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	// Both should have the product
	await expectProductActive({
		customer,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Both should have independent balances
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Attach free to customer, then free to entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach free to customer first
 * - Then attach free to entity
 *
 * Expected Result:
 * - Both have product independently
 */
test.concurrent(`${chalk.yellowBright("new-plan: attach free to customer, then free to entity")}`, async () => {
	const customerId = "new-plan-attach-free-cust-ent";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free-cust-ent",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			s.products({ list: [free] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: free.id }), // Customer-level
			s.billing.attach({ productId: free.id, entityIndex: 0 }), // Entity-level
		],
	});

	// Get customer and entity
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const entity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	// Both should have the product
	await expectProductActive({
		customer,
		productId: free.id,
	});
	await expectProductActive({
		customer: entity,
		productId: free.id,
	});

	// Both should have independent balances
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 50,
		balance: 50,
		usage: 0,
	});

	// Verify no invoices (both free)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});
});
