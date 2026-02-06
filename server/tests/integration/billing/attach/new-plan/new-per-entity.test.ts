/**
 * New Plan Per-Entity Feature Tests (Attach V2)
 *
 * Tests for attaching products with per-entity features (entityFeatureId).
 * Per-entity features give each entity its own balance allocation from a
 * single customer-level product.
 *
 * Key behaviors tested:
 * - Per-entity + customer-level same feature coexistence
 * - Overage billing: sum all entities FIRST, then round to billing units
 * - Create entity AFTER product attach - new entity gets its balance
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Per-entity + customer-level same feature IN SAME PRODUCT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Single product with TWO feature items for the same feature (Messages):
 *   - 100 messages at customer level (no entityFeatureId)
 *   - 50 messages per entity (with entityFeatureId)
 * - Create 2 entities
 * - Track at entity 1: 30 messages
 *
 * Expected Result:
 * - Entity 1: balance = customer's 100 + entity's 50 - 30 = 120
 * - Entity 2: balance = customer's 100 + entity's 50 = 150
 * - Customer total: 100 + (50 * 2) = 200, usage = 30, balance = 170
 *
 * Deduction order: Entity-level balance is deducted FIRST when tracking at entity.
 */
test.concurrent(`${chalk.yellowBright("new-per-entity 1: per-entity + customer-level same feature in same product")}`, async () => {
	const customerId = "new-pe-cust-and-entity-same-prod";

	// Customer-level messages (NOT per-entity) - 100 shared across all
	const customerMessages = items.monthlyMessages({ includedUsage: 100 });

	// Per-entity messages - each entity gets 50
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 50,
		entityFeatureId: TestFeature.Users,
	});

	// Single product with BOTH feature items
	const pro = products.pro({
		id: "pro-mixed",
		items: [customerMessages, perEntityMessages],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach single product with both customer-level and per-entity items
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			// Track on entity 1
			s.track({
				featureId: TestFeature.Messages,
				value: 30,
				entityIndex: 0,
				timeout: 2000,
			}),
		],
	});

	// Verify entity 1: has both customer + per-entity balance, minus usage
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 150, // 100 (customer) + 50 (per-entity)
		balance: 120, // 150 - 30
		usage: 30,
	});

	// Verify entity 2: no usage, full balance
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 150, // 100 (customer) + 50 (per-entity)
		balance: 150, // No usage
		usage: 0,
	});

	// Verify customer total
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200, // 100 + (50 * 2)
		balance: 170, // 200 - 30
		usage: 30,
	});

	// Product should be active at customer level
	await expectProductActive({
		customer,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Per-entity overage: sum usage then round to billing units
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Per-entity consumable: 100 included per entity, $1.00 per 10 units overage
 * - 2 entities
 * - Entity 1: uses 155
 * - Entity 2: uses 123
 * - Total usage: 155 + 123 = 278, rounded to billing units (10) = 280
 * - Total included: 100 * 2 = 200
 * - Overage: 280 - 200 = 80
 * - Billing: ceil(80/10) * $1 = 8 * $1 = $8
 *
 * Key behavior: Usage is SUMMED across entities FIRST, THEN rounded to billing units.
 * NOT rounded per entity then summed.
 *
 * Expected Result:
 * - Overage billed correctly as $8
 */
test.concurrent(`${chalk.yellowBright("new-per-entity 2: overage sum usage then round to billing units")}`, async () => {
	const customerId = "new-pe-overage-sum-round";

	// Per-entity consumable: 100 included, $1.00 per 10 units overage
	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1.0, // $1 per billing unit
		billingUnits: 10, // 10 units per billing unit
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro-pe-overage",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach per-entity product to customer (NOT to each entity)
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			// Track usage on entities
			// Total: 155 + 123 = 278, rounded to 280
			s.track({
				featureId: TestFeature.Messages,
				value: 155,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 123,
				entityIndex: 1,
				timeout: 2000,
			}),
			// Advance to next invoice to trigger overage billing
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Verify entity 1 after cycle reset
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100, // Reset after cycle
		usage: 0, // Reset after cycle
	});

	// Verify entity 2 after cycle reset
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity2,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100, // Reset after cycle
		usage: 0, // Reset after cycle
	});

	// Verify customer invoices:
	// 1. Initial attach: $20 (pro base)
	// 2. Renewal + overage: $20 (base) + $8 (overage) = $28
	//    Total usage: 278 → rounded to 280
	//    Total included: 200
	//    Overage: 80 → ceil(80/10) * $1 = $8
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 28, // $20 base + $8 overage
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Create entity AFTER product attach
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach per-entity product to customer
 * - Create new entity AFTER attach
 *
 * Expected Result:
 * - New entity gets its per-entity balance allocation
 */
test.concurrent(`${chalk.yellowBright("new-per-entity 3: create entity after product attach")}`, async () => {
	const customerId = "new-pe-entity-after-attach";

	// Per-entity consumable: 200 messages per entity
	const perEntityMessages = items.monthlyMessages({
		includedUsage: 200,
		entityFeatureId: TestFeature.Users,
	});
	const pro = products.pro({
		id: "pro-pe-late-entity",
		items: [perEntityMessages],
	});

	// Start with 1 entity, attach product
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach per-entity product to customer
			s.billing.attach({ productId: pro.id, timeout: 4000 }),
			// Track some usage on entity 1
			s.track({
				featureId: TestFeature.Messages,
				value: 50,
				entityIndex: 0,
				timeout: 2000,
			}),
		],
	});

	// Verify entity 1 has balance with usage
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 150, // 200 - 50
		usage: 50,
	});

	// Customer total before new entity: 200 included, 50 used
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: 200, // 1 entity * 200
		balance: 150,
		usage: 50,
	});

	// Now create a NEW entity AFTER product was attached
	const newEntityId = "new-entity-late";
	await autumnV1.entities.create(customerId, [
		{
			id: newEntityId,
			name: "New Entity (Late)",
			feature_id: TestFeature.Users,
		},
	]);

	// Wait for entity creation to sync
	await new Promise((r) => setTimeout(r, 2000));

	// Verify new entity gets its per-entity balance
	const newEntity = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		newEntityId,
	);
	expectCustomerFeatureCorrect({
		customer: newEntity,
		featureId: TestFeature.Messages,
		includedUsage: 200, // New entity gets its allocation
		balance: 200, // Full balance, no usage yet
		usage: 0,
	});

	// Customer total should now include new entity
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 400, // 2 entities * 200
		balance: 350, // 400 - 50 (only entity 1 has usage)
		usage: 50,
	});

	// Product should still be active at customer level
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Only 1 invoice from initial attach ($20)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 20,
	});
});
