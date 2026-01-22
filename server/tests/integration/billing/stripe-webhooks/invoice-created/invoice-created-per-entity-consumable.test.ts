/**
 * Invoice Created Webhook Tests - Per-Entity Consumable Prices
 *
 * Tests for handling the `invoice.created` Stripe webhook event for per-entity
 * consumable (usage-in-arrear) prices. Per-entity means each entity (e.g., user/seat)
 * gets its own balance allocation (entity_feature_id is set).
 *
 * IMPORTANT: For per-entity features, the product is attached ONCE to the customer,
 * and each entity automatically gets its own balance. The base price is charged
 * once per product attachment, NOT per entity.
 *
 * These tests verify that:
 * 1. Each entity's overage is calculated and billed correctly
 * 2. Total invoice reflects sum of all entity overages + single base price
 * 3. Billing units (rounding up) are respected for per-entity consumables
 * 4. Entity balances are reset after the invoice is created
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Per entity consumable with included usage - multiple entities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $0.10/unit overage)
 * - 3 entities are created (each gets 100 included)
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 150 messages (50 overage)
 * - Entity 2: Track 250 messages (150 overage)
 * - Entity 3: Track 350 messages (250 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Total overage: 50 + 150 + 250 = 450 units * $0.10 = $45
 * - Final invoice: $20 base (single) + $45 overage = $65
 * - All entity balances reset to 100 after cycle
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: 3 entities with varying overage → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-3ent";

	// Create per-entity consumable messages (100 included per entity)
	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach product ONCE to the customer (not per entity)
			s.attach({ productId: pro.id }),
			// Track varying usage on each entity (must specify entityIndex for per-entity features)
			s.track({ featureId: TestFeature.Messages, value: 150, entityIndex: 0 }), // 50 overage
			s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 1 }), // 150 overage
			s.track({ featureId: TestFeature.Messages, value: 350, entityIndex: 2 }), // 250 overage
			s.advanceToNextInvoice(),
		],
	});

	// Verify overage calculations
	// Each entity: (usage - 100 included) * $0.10
	// Entity 1: (150 - 100) * 0.10 = $5
	// Entity 2: (250 - 100) * 0.10 = $15
	// Entity 3: (350 - 100) * 0.10 = $25
	// Total overage: $45

	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 150 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(5);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(15);

	const entity3Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 350 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity3Overage).toBe(25);

	const totalOverage = entity1Overage + entity2Overage + entity3Overage;
	expect(totalOverage).toBe(45);

	// Verify final customer state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: 1 initial attach ($20) + 1 renewal ($20 base + $45 overage = $65)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage, // $65
	});

	// Verify each entity balance is reset to 100
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		await expectProductActive({
			customer: entityData,
			productId: pro.id,
		});
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}

	// Verify customer total (sum of all entities)
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100 * 3, // 300 total included
		balance: 100 * 3, // 300 total balance after reset
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Per entity consumable with billing units > 1 (sum then round)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $1/10 units, billingUnits=10)
 * - 2 entities are created
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 155 messages → 55 overage
 * - Entity 2: Track 123 messages → 23 overage
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Total overage: 55 + 23 = 78 → rounds UP to 80 (billingUnits=10)
 * - Charge: ceil(78/10) * $1 = 8 * $1 = $8
 * - Final invoice: $20 base (single) + $8 overage = $28
 *
 * IMPORTANT: For per-entity consumables, ALL entity overages are SUMMED FIRST,
 * then the TOTAL is rounded up to billing units. NOT rounded per-entity then summed.
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: billing units - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-billing-units";

	// Create per-entity consumable with billingUnits=10, $1 per 10 units
	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1, // $1 per 10 units
		billingUnits: 10,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 155, entityIndex: 0 }), // 55 overage
			s.track({ featureId: TestFeature.Messages, value: 123, entityIndex: 1 }), // 23 overage
			s.advanceToNextInvoice(),
		],
	});

	// Per-entity consumables: sum all overages first, then round up total
	// Entity 1: 155 - 100 = 55 overage
	// Entity 2: 123 - 100 = 23 overage
	// Total overage: 55 + 23 = 78 → ceil(78/10) = 8 → 8 * $1 = $8
	const totalOverage = 8;

	// Verify final state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 1 initial invoice ($20) + 1 renewal ($20 base + $8 overage = $28)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage, // $28
	});

	// Verify entity balances reset
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Per entity consumable - some entities in overage, some within included
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $0.10/unit overage)
 * - 3 entities
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 50 messages (NO overage - within included)
 * - Entity 2: Track 100 messages (NO overage - exactly at included)
 * - Entity 3: Track 200 messages (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Only Entity 3 has overage: 100 * $0.10 = $10
 * - Final invoice: $20 base (single) + $10 overage = $30
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: mixed usage - some in overage, some within included")}`, async () => {
	const customerId = "inv-pe-cons-mixed";

	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50, entityIndex: 0 }), // Within included
			s.track({ featureId: TestFeature.Messages, value: 100, entityIndex: 1 }), // Exactly at included
			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 2 }), // 100 overage
			s.advanceToNextInvoice(),
		],
	});

	// Verify individual overages
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 50 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(0); // No overage

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 100 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(0); // No overage

	const entity3Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity3Overage).toBe(10); // 100 * $0.10

	// Verify final state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 1 initial invoice ($20) + 1 renewal ($20 base + $10 overage = $30)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + 10, // $30
	});

	// Verify all entity balances reset to 100
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST D: Per entity consumable - all within included (no overage invoice)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $0.10/unit overage)
 * - 2 entities
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 30 messages (within included)
 * - Entity 2: Track 70 messages (within included)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - No overage charges
 * - Final invoice: $20 base (single) only
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: no overage - all within included → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-no-ovg";

	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 70, entityIndex: 1 }),
			s.advanceToNextInvoice(),
		],
	});

	// Verify no overages
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 30 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(0);

	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 70 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(0);

	// Verify final state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 1 initial invoice ($20) + 1 renewal ($20 base only, no overage)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20, // $20 - only base price
	});

	// Verify entity balances reset
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST E: Per entity consumable with decimal usage values (sum then round)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $0.10/unit overage, billingUnits=1)
 * - 2 entities
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 150.5 messages → 50.5 overage
 * - Entity 2: Track 175.75 messages → 75.75 overage
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Total overage: 50.5 + 75.75 = 126.25 → rounds UP to 127 (billingUnits=1)
 * - Charge: 127 * $0.10 = $12.70
 * - Final invoice: $20 base (single) + $12.70 overage = $32.70
 *
 * NOTE: For per-entity consumables, ALL entity overages are SUMMED FIRST,
 * then the TOTAL is rounded up to billing units.
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: decimal usage - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-decimal";

	const perEntityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: 150.5,
				entityIndex: 0,
			}), // 50.5 overage
			s.track({
				featureId: TestFeature.Messages,
				value: 175.75,
				entityIndex: 1,
			}), // 75.75 overage
			s.advanceToNextInvoice(),
		],
	});

	// Per-entity consumables: sum all overages first, then round up total
	// Entity 1: 150.5 - 100 = 50.5 overage
	// Entity 2: 175.75 - 100 = 75.75 overage
	// Total overage: 50.5 + 75.75 = 126.25 → ceil(126.25/1) = 127 → 127 * $0.10 = $12.70
	const totalOverage = 12.7;

	// Verify final state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 1 initial invoice ($20) + 1 renewal ($20 base + $12.70 overage = $32.70)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage, // $32.70
	});

	// Verify entity balances reset
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST F: Per entity consumable - billing units with partial rounding (sum then round)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/month) with per-entity consumable messages
 *   (100 included per entity, $2/25 units, billingUnits=25)
 * - 2 entities
 * - Product is attached ONCE to the customer
 * - Entity 1: Track 113 messages → 13 overage
 * - Entity 2: Track 176 messages → 76 overage
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Total overage: 13 + 76 = 89 → rounds UP to 100 (ceil(89/25)*25 = 100)
 * - Charge: ceil(89/25) = 4 → 4 * $2 = $8
 * - Final invoice: $20 base (single) + $8 overage = $28
 *
 * IMPORTANT: For per-entity consumables, ALL entity overages are SUMMED FIRST,
 * then the TOTAL is rounded up to billing units. NOT rounded per-entity then summed.
 */
test(`${chalk.yellowBright("invoice.created per-entity consumable: billing units partial - sum then round → advance cycle")}`, async () => {
	const customerId = "inv-pe-cons-partial-round";

	// $2 per 25 units, 100 included per entity
	const perEntityConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 2,
		billingUnits: 25,
		entityFeatureId: TestFeature.Users,
	});

	const pro = products.pro({
		id: "pro",
		items: [perEntityConsumable],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 113, entityIndex: 0 }), // 13 overage
			s.track({ featureId: TestFeature.Messages, value: 176, entityIndex: 1 }), // 76 overage
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Per-entity consumables: sum all overages first, then round up total
	// Entity 1: 113 - 100 = 13 overage
	// Entity 2: 176 - 100 = 76 overage
	// Total overage: 13 + 76 = 89 → ceil(89/25) = 4 → 4 * $2 = $8
	const totalOverage = 8;

	// Verify final state
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// 1 initial invoice ($20) + 1 renewal ($20 base + $8 overage = $28)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 20 + totalOverage, // $28
	});

	// Verify entity balances reset
	for (const entity of entities) {
		const entityData = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entity.id,
		);
		expectCustomerFeatureCorrect({
			customer: entityData,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});
	}
});
