/**
 * Attach Consumable Entity Compatibility Tests (v1 + v2 Mix)
 *
 * Tests for verifying that v1 attach and v2 attach work correctly together
 * when attaching products with consumable pricing to entities.
 *
 * Key behaviors tested:
 * 1. v1 attach on one entity + v2 attach on another entity
 * 2. v1 attach at customer level + v2 attach at entity level
 * 3. Invoice charges are calculated correctly for both
 * 4. Subscription items are correct after both attach methods
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
// TEST 1: v1 attach entity + v2 attach entity - both charged correctly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities
 * - Entity 1: v1 attach Pro with consumable messages (100 included, $0.10/unit)
 * - Entity 2: v2 attach Pro with consumable messages (100 included, $0.10/unit)
 * - Entity 1: track 200 messages (100 overage → $10)
 * - Entity 2: track 350 messages (250 overage → $25)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoices: $20 each = $40 total
 * - After cycle:
 *   - Entity 1 (v1): $20 base + $10 overage = $30
 *   - Entity 2 (v2): $20 base + $25 overage = $45
 * - Subscription items are correct for both
 */
test.concurrent(`${chalk.yellowBright("attach consumable compat: v1 entity + v2 entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v1v2-entities";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// v1 attach to entity 0
			s.attach({ productId: pro.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 4000 }),

			// Track different amounts on each entity
			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 0 }), // v1: 100 overage
			s.track({ featureId: TestFeature.Messages, value: 350, entityIndex: 1 }), // v2: 250 overage
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
	// Entity 1 (v1): (200 - 100) * $0.10 = $10
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(entity1Overage).toBe(10);

	// Entity 2 (v2): (350 - 100) * $0.10 = $25
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
	// - 2 renewal invoices ($20 + overage each)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20 * 2,
	});

	// Verify entity balances reset to 100
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity1, productId: pro.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity2, productId: pro.id });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: v2 attach entity + v1 attach entity - reversed order
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has 2 entities
 * - Entity 1: v2 attach Pro with consumable messages (100 included, $0.10/unit)
 * - Entity 2: v1 attach Pro with consumable messages (100 included, $0.10/unit)
 * - Entity 1 (v2): track 250 messages (150 overage → $15)
 * - Entity 2 (v1): track 180 messages (80 overage → $8)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoices: $20 each = $40 total
 * - After cycle:
 *   - Entity 1 (v2): $20 base + $15 overage = $35
 *   - Entity 2 (v1): $20 base + $8 overage = $28
 * - Subscription items are correct
 */
test.concurrent(`${chalk.yellowBright("attach consumable compat: v2 entity + v1 entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v2ent-v1ent";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// v2 attach to entity 0
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			// v1 attach to entity 1
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 4000 }),
			// Track usage at entity 0 (v2)
			s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 0 }), // 150 overage
			// Track usage at entity 1 (v1)
			s.track({ featureId: TestFeature.Messages, value: 180, entityIndex: 1 }), // 80 overage
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overages
	// Entity 1 (v2): (250 - 100) * $0.10 = $15
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 250 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(15);

	// Entity 2 (v1): (180 - 100) * $0.10 = $8
	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 180 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(8);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 3 invoices total (2 initial + 1 renewal)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20 * 2,
	});

	// Verify entity balances reset to 100
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	expect(entity1.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity1, productId: pro.id });

	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	expect(entity2.features[TestFeature.Messages].balance).toBe(100);
	await expectProductActive({ customer: entity2, productId: pro.id });

	// Verify subscriptions are correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Mixed v2/v1 with different products (reversed)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: v2 attach Pro ($20/month, 100 included, $1/10 units, billingUnits=10)
 * - Entity 2: v1 attach Premium ($50/month, 200 included, $2/25 units, billingUnits=25)
 * - Entity 1: Track 175 messages → 75 overage → rounds to 80 → $8
 * - Entity 2: Track 289 messages → 89 overage → rounds to 100 → $8
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoices: $20 (Pro) + $50 (Premium) = $70
 * - After cycle:
 *   - Entity 1 (v2 Pro): $20 base + $8 overage = $28
 *   - Entity 2 (v1 Premium): $50 base + $8 overage = $58
 * - Subscription items are correct
 */
test.concurrent(`${chalk.yellowBright("attach consumable compat: v2 Pro entity + v1 Premium entity → both charged correctly")}`, async () => {
	const customerId = "attach-compat-v2pro-v1prem";

	// Pro: $1 per 10 units, 100 included
	const proConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1,
		billingUnits: 10,
	});

	// Premium: $2 per 25 units, 200 included
	const premiumConsumable = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 200,
		price: 2,
		billingUnits: 25,
	});

	const pro = products.pro({
		id: "pro",
		items: [proConsumable],
	});

	const premium = products.base({
		id: "premium",
		items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// v2 attach Pro to entity 0
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			// v1 attach Premium to entity 1
			s.attach({ productId: premium.id, entityIndex: 1, timeout: 4000 }),
			// Track usage
			s.track({ featureId: TestFeature.Messages, value: 175, entityIndex: 0 }), // Pro: 75 overage
			s.track({ featureId: TestFeature.Messages, value: 289, entityIndex: 1 }), // Premium: 89 overage
			s.advanceToNextInvoice({ withPause: true }),
		],
	});

	// Calculate expected overages
	// Entity 1 (v2 Pro): ceil(75/10) = 8 billing units → $8
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 175 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(8);

	// Entity 2 (v1 Premium): ceil(89/25) = 4 billing units → $8
	const entity2Overage = calculateExpectedInvoiceAmount({
		items: premium.items,
		usage: [{ featureId: TestFeature.Messages, value: 289 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity2Overage).toBe(8);

	// Verify entity states
	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1Final, productId: pro.id });
	expect(entity1Final.features[TestFeature.Messages].balance).toBe(100);

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2Final, productId: premium.id });
	expect(entity2Final.features[TestFeature.Messages].balance).toBe(200);

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Total overage: $8 + $8 = $16
	// Initial invoices: $20 + $50 = $70
	// Renewal: $20 + $50 + $16 = $86
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 renewal
		latestTotal: 20 + 50 + entity1Overage + entity2Overage,
	});

	// Verify subscriptions are correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1,
	});
});
