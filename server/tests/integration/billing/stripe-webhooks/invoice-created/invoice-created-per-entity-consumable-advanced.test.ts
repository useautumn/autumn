/**
 * Invoice Created Webhook Tests - Per-Entity Consumable Prices (Advanced)
 *
 * Tests for handling the `invoice.created` Stripe webhook event for per-entity
 * consumable (usage-in-arrear) prices. Covers edge cases: no overage,
 * decimal usage values, and billing units with partial rounding.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Per entity consumable - all within included (no overage invoice)
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
test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: no overage - all within included → advance cycle")}`, async () => {
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
			s.advanceToNextInvoice({ withPause: true }),
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
// TEST 2: Per entity consumable with decimal usage values (sum then round)
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
test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: decimal usage - sum then round → advance cycle")}`, async () => {
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
			s.advanceToNextInvoice({ withPause: true }),
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
// TEST 3: Per entity consumable - billing units with partial rounding (sum then round)
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
test.concurrent(`${chalk.yellowBright("invoice.created per-entity consumable: billing units partial - sum then round → advance cycle")}`, async () => {
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
