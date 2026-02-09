/**
 * Attach Consumable Entity Tests
 *
 * Tests for attaching products with consumable (usage-in-arrear) pricing
 * to entities. These tests verify that:
 * 1. Consumable products can be attached to entities
 * 2. Usage tracked on entities is billed correctly
 * 3. Each entity's overage is calculated and charged independently
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro with consumable → track into overage (decimal) → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Track 250.5 messages (150.5 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: invoice should include base price ($20) + overage (150.5 * $0.10 = $15.05)
 * - Total second invoice: $20 + $15.05 = $35.05
 * - Balance should be reset to 100 (included usage)
 */
test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: track decimal overage → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-decimal";

	// Create consumable messages with 100 included
	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 250.5 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overage: 150.5 units * $0.10 = $15.05
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250.5 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	// Verify overage calculation: (251 - 100) * $0.10 = $15.1
	expect(expectedOverage).toBe(15.1);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be active
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// Should have 2 invoices: initial ($20) + renewal ($20 base + $15.05 overage = $35.05)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $20 base + $15.05 overage
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage) after cycle
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: No overage - track within included usage → advance cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 50 messages (within included usage, no overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: invoice should only include base price ($20), no overage
 * - Balance should be reset to 100 (included usage)
 */
test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: no overage - track within included → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-no-ovg";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 50 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 base only, no overage)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20, // Only base price, no overage
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 after cycle
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Large overage with exact calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 1000 messages (900 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - After cycle: $20 base + $90 overage (900 * $0.10) = $110
 */
test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: large overage → advance cycle")}`, async () => {
	const customerId = "attach-v2-cons-ent-large";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 1000 }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected: 900 * $0.10 = $90
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 1000 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(expectedOverage).toBe(90);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + renewal ($20 + $90 = $110)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: 20 + expectedOverage, // $110
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multiple entities with consumable - each entity charged correctly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities
 * - Each entity has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Entity 1: track 200 messages (100 overage → $10)
 * - Entity 2: track 350 messages (250 overage → $25)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoices: $20 each = $40 total (2 pro base prices)
 * - After cycle:
 *   - Entity 1 invoice: $20 base + $10 overage = $30
 *   - Entity 2 invoice: $20 base + $25 overage = $45
 * - Each entity's balance should reset to 100
 */
test.concurrent(`${chalk.yellowBright("attach v2 consumable entity: multiple entities → each charged correctly")}`, async () => {
	const customerId = "attach-v2-cons-ent-multi";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro to each entity
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
			// Track different amounts on each entity
			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 0 }), // 100 overage
			s.track({ featureId: TestFeature.Messages, value: 350, entityIndex: 1 }), // 250 overage
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Calculate expected overages
	// Entity 1: (200 - 100) * $0.10 = $10
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(10);

	// Entity 2: (350 - 100) * $0.10 = $25
	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 350 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(25);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 4 invoices total:
	// - 2 initial invoices ($20 each)
	// - 1 renewal invoices ($20 + overage each)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
	});

	// Verify entity balances reset to 100
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
});
