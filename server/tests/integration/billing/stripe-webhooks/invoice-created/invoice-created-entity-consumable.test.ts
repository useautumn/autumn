/**
 * Invoice Created Webhook Tests - Entity + Customer Consumables with Cancel
 *
 * Tests for handling the `invoice.created` Stripe webhook when both entity-level
 * and customer-level consumable products exist, particularly around cancellation.
 *
 * Key concern:
 * - Entity-level consumables use new invoice line items method (added during invoice.created)
 * - Customer-level consumables use Stripe metered prices (legacy, billed automatically)
 * - subscription.deleted creates arrear invoice for entity products
 * - invoice.created ALSO fires and may try to add line items
 * - Risk of DOUBLE BILLING for entity-level consumables
 *
 * Expected behaviors:
 * - Entity-level consumables should only be billed ONCE
 * - Customer-level consumables with meters should not get duplicate charges
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Regular cycle renewal (no cancel) - entity consumable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages
 * - Track overage on entity
 * - Advance to next cycle (no cancel, just regular renewal)
 *
 * This tests the normal happy path for invoice.created with entity consumables.
 *
 * Expected Result:
 * - Renewal invoice includes base price + overage
 * - Overage billed exactly once via invoice line items
 * - Balance resets after cycle
 */
test(`${chalk.yellowBright("invoice.created entity: regular renewal - overage billed once")}`, async () => {
	const customerId = "inv-created-ent-renewal";

	// Entity-level consumable messages

	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 500 }),
		],
	});

	const entityId = entities[0].id;

	// Verify overage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Advance to next cycle (regular renewal)
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify product still active
	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entityFinal,
		productId: pro.id,
	});

	// Balance should reset to 100
	expectCustomerFeatureCorrect({
		customer: entityFinal,
		featureId: TestFeature.Messages,
		balance: 100,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected invoices:
	// 1. Initial attach: $20
	// 2. Renewal: $20 base + $40 overage = $60
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 60,
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity consumable + Customer consumable - cancel customer end of cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages (uses invoice line items)
 * - Track overage on BOTH customer and entity
 * - Cancel CUSTOMER-level product end of cycle (entity stays active)
 * - Advance to next invoice

 */
test(`${chalk.yellowBright("invoice.created entity+customer: cancel customer end of cycle - no double billing")}`, async () => {
	const customerId = "inv-created-ent-cus-eoc";

	// Customer-level consumable messages (will use Stripe meters)
	const customerConsumable = items.consumableMessages({ includedUsage: 100 });

	// Entity-level consumable messages (will use invoice line items)
	const entityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	// Two separate products - both $20 base
	const customerPro = products.pro({
		id: "customer-pro",
		items: [customerConsumable],
	});

	const entityPro = products.pro({
		id: "entity-pro",
		items: [entityConsumable],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [customerPro, entityPro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPro.id }), // Customer-level
			s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
			s.track({ featureId: TestFeature.Messages, value: 300 }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
			s.updateSubscription({
				productId: customerPro.id,
				cancel: "end_of_cycle",
			}),
		],
	});

	const entityId = entities[0].id;

	// Verify initial invoices: $20 for customer-pro + $20 for entity-pro = $40
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	// Verify customer product is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: customerPro.id,
	});

	// Advance to next invoice
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Customer product should be removed
	await expectProductNotPresent({
		customer: customerFinal,
		productId: customerPro.id,
	});

	// Entity product should still be active (not canceled)
	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entityFinal,
		productId: entityPro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: 100,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	const overageTotal = 35;
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 overage invoice
		latestTotal: overageTotal + 20, // 20 for one renewal.
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: entityPro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1b: Entity consumable + Customer consumable - cancel BOTH end of cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages (uses invoice line items)
 * - Track overage on BOTH customer and entity
 * - Cancel BOTH products end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Final invoice should only contain overages (no base prices)
 * - Customer overage: $20 (200 * $0.10)
 * - Entity overage: $15 (150 * $0.10)
 * - Total final invoice: $35
 */
test(`${chalk.yellowBright("invoice.created entity+customer: cancel both end of cycle - no double billing")}`, async () => {
	const customerId = "inv-created-both-cancel-eoc";

	// Customer-level consumable messages (will use Stripe meters)
	const customerConsumable = items.consumableMessages({ includedUsage: 100 });

	// Entity-level consumable messages (will use invoice line items)
	const entityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	// Two separate products - both $20 base
	const customerPro = products.pro({
		id: "customer-pro",
		items: [customerConsumable],
	});

	const entityPro = products.pro({
		id: "entity-pro",
		items: [entityConsumable],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [customerPro, entityPro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPro.id }), // Customer-level
			s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
			s.track({ featureId: TestFeature.Messages, value: 300 }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
			s.updateSubscription({
				productId: customerPro.id,
				cancel: "end_of_cycle",
			}),
			s.updateSubscription({
				entityIndex: 0,
				productId: entityPro.id,
				cancel: "end_of_cycle",
			}),
		],
	});

	const entityId = entities[0].id;

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

	// Customer and entity balance: 200 - 550 = -350
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-350);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	// Verify both products are canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: customerPro.id,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: entityPro.id,
	});

	// Advance to next invoice
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state - both products should be removed
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerFinal,
		productId: customerPro.id,
	});

	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityFinal,
		productId: entityPro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 overage invoice
		latestTotal: 35,
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: entityPro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity consumable with billing units - multiple entities (per-entity rounding)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - 2 entities, each with their own Pro product ($20/month base)
 * - Consumable messages: 100 included, $1/10 units, billingUnits=10
 * - Entity 1: Track 155 messages → 55 overage → rounds UP to 60 → $6
 * - Entity 2: Track 123 messages → 23 overage → rounds UP to 30 → $3
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Entity 1 overage: ceil(55/10) * $1 = $6
 * - Entity 2 overage: ceil(23/10) * $1 = $3
 * - Total overage: $9
 * - Renewal invoice: $20 base * 2 + $9 overage = $49
 *
 * IMPORTANT: For ENTITY PRODUCTS (attached TO entities), each entity's overage
 * is rounded up to billing units INDIVIDUALLY, then summed.
 * This is DIFFERENT from per-entity features where total is summed first then rounded.
 */
test(`${chalk.yellowBright("invoice.created entity: billing units - each entity rounded individually → advance cycle")}`, async () => {
	const customerId = "inv-ent-billing-units";

	// Consumable with billingUnits=10, $1 per 10 units
	const consumableItem = items.consumable({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		price: 1, // $1 per 10 units
		billingUnits: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 2000 }),
			s.track({ featureId: TestFeature.Messages, value: 155, entityIndex: 0 }), // 55 overage → $6
			s.track({ featureId: TestFeature.Messages, value: 123, entityIndex: 1 }), // 23 overage → $3
		],
	});

	// Verify overage tracked
	const entity1AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-55);

	const entity2AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-23);

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify entities still active with reset balances
	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Final,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1Final,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Final,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2Final,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entity products: each entity's overage rounded individually
	// Entity 1: ceil(55/10) = 6 → $6
	// Entity 2: ceil(23/10) = 3 → $3
	// Total overage: $9
	// Initial invoices: $20 * 2 = $40
	// Renewal: $20 * 2 + $9 = $49
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 renewal
		latestTotal: 49,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2b: 2 entities on 2 different products with different consumable configs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Pro product ($20/month) with consumable messages
 *   (100 included, $1/10 units, billingUnits=10)
 * - Entity 2: Premium product ($50/month) with consumable messages
 *   (200 included, $2/25 units, billingUnits=25)
 * - Entity 1: Track 175 messages → 75 overage → rounds to 80 → $8
 * - Entity 2: Track 289 messages → 89 overage → rounds to 100 → $8
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Entity 1 overage: ceil(75/10) * $1 = $8
 * - Entity 2 overage: ceil(89/25) * $2 = $8
 * - Total overage: $16
 * - Renewal invoice: $20 + $50 + $16 = $86
 */
test(`${chalk.yellowBright("invoice.created entity: 2 entities, 2 different products → advance cycle")}`, async () => {
	const customerId = "inv-ent-2prod-2ent";

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

	// Premium is $50/month base (use base product with custom price)
	const premium = products.base({
		id: "premium",
		items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1, timeout: 2000 }),
			s.track({ featureId: TestFeature.Messages, value: 175, entityIndex: 0 }), // 75 overage
			s.track({ featureId: TestFeature.Messages, value: 289, entityIndex: 1 }), // 89 overage
		],
	});

	// Verify overage tracked
	const entity1AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-75);

	const entity2AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-89);

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify entities still active with reset balances
	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({
		customer: entity1Final,
		productId: pro.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity1Final,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({
		customer: entity2Final,
		productId: premium.id,
	});
	expectCustomerFeatureCorrect({
		customer: entity2Final,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entity 1: ceil(75/10) = 8 → $8
	// Entity 2: ceil(89/25) = 4 → $8
	// Total overage: $16
	// Initial invoices: $20 + $50 = $70
	// Renewal: $20 + $50 + $16 = $86
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 renewal
		latestTotal: 86,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2c: Complex - 2 products, 4 entities (2 on each product)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/month): 100 included, $1/10 units, billingUnits=10
 *   - Entity 1: Track 155 messages → 55 overage → rounds to 60 → $6
 *   - Entity 2: Track 123 messages → 23 overage → rounds to 30 → $3
 * - Premium product ($50/month): 200 included, $2/25 units, billingUnits=25
 *   - Entity 3: Track 275 messages → 75 overage → rounds to 75 → $6
 *   - Entity 4: Track 351 messages → 151 overage → rounds to 175 → $14
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Pro entities overage: $6 + $3 = $9
 * - Premium entities overage: $6 + $14 = $20
 * - Total overage: $29
 * - Renewal invoice: $20*2 + $50*2 + $29 = $169
 */
test(`${chalk.yellowBright("invoice.created entity: 4 entities, 2 products (2 each) → advance cycle")}`, async () => {
	const customerId = "inv-ent-4ent-2prod";

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

	// Premium is $50/month base
	const premium = products.base({
		id: "premium",
		items: [premiumConsumable, items.monthlyPrice({ price: 50 })],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 4, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro to entities 0 and 1
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
			// Attach premium to entities 2 and 3
			s.attach({ productId: premium.id, entityIndex: 2 }),
			s.attach({ productId: premium.id, entityIndex: 3, timeout: 2000 }),
			// Track usage
			s.track({ featureId: TestFeature.Messages, value: 155, entityIndex: 0 }), // Pro: 55 overage → $6
			s.track({ featureId: TestFeature.Messages, value: 123, entityIndex: 1 }), // Pro: 23 overage → $3
			s.track({ featureId: TestFeature.Messages, value: 275, entityIndex: 2 }), // Premium: 75 overage → $6
			s.track({ featureId: TestFeature.Messages, value: 351, entityIndex: 3 }), // Premium: 151 overage → $14
		],
	});

	// Verify overage tracked for all entities
	const entity1AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	expect(entity1AfterTrack.features[TestFeature.Messages].balance).toBe(-55);

	const entity2AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	expect(entity2AfterTrack.features[TestFeature.Messages].balance).toBe(-23);

	const entity3AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[2].id,
	);
	expect(entity3AfterTrack.features[TestFeature.Messages].balance).toBe(-75);

	const entity4AfterTrack = await autumnV1.entities.get(
		customerId,
		entities[3].id,
	);
	expect(entity4AfterTrack.features[TestFeature.Messages].balance).toBe(-151);

	// Advance to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify all entities still active with reset balances
	const entity1Final = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1Final, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity1Final,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const entity2Final = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductActive({ customer: entity2Final, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entity2Final,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const entity3Final = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductActive({ customer: entity3Final, productId: premium.id });
	expectCustomerFeatureCorrect({
		customer: entity3Final,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	const entity4Final = await autumnV1.entities.get(customerId, entities[3].id);
	await expectProductActive({ customer: entity4Final, productId: premium.id });
	expectCustomerFeatureCorrect({
		customer: entity4Final,
		featureId: TestFeature.Messages,
		balance: 200,
	});

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Pro entities (each rounded individually):
	// Entity 1: ceil(55/10) = 6 → $6
	// Entity 2: ceil(23/10) = 3 → $3
	// Pro total overage: $9

	// Premium entities (each rounded individually):
	// Entity 3: ceil(75/25) = 3 → $6
	// Entity 4: ceil(151/25) = 7 → $14
	// Premium total overage: $20

	// Total overage: $29
	// Initial invoices: $20 + $20 + $50 + $50 = $140
	// Renewal: $20 + $20 + $50 + $50 + $29 = $169
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 5, // 4 initial attaches + 1 renewal
		latestTotal: 169,
	});
});
