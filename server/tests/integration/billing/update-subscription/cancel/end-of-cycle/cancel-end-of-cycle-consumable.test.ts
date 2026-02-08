/**
 * Cancel End of Cycle Consumable Tests
 *
 * Tests for canceling products with consumable/arrear items at end of cycle.
 * Consumable items create a final invoice at end of cycle for any overage usage.
 *
 * Key behaviors:
 * - Overage usage is billed at cycle end (arrear pricing)
 * - Cancel end of cycle: overage billed in final invoice when cycle ends naturally
 * - Both customer-level and entity-level consumables are covered
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
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
// TEST 1: Track → cancel end of cycle → advance (customer-level)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $40 (400 overage * $0.10)
 * - Product removed after cycle ends
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: customer - track overage → cancel → advance")}`, async () => {
	const customerId = "cancel-eoc-cons-cus";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1Beta, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Initial attach invoice: $20 base price
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages (100 included, 400 overage)
	await autumnV1Beta.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Cancel end of cycle
	await autumnV1Beta.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling
	const customerAfterCancel =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Advance to next invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Calculate expected overage amount
	// 500 total usage - 100 included = 400 overage * $0.10 = $40
	const expectedOverage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 500 }],
		options: { includeFixed: false, onlyArrear: true },
	});

	expect(expectedOverage).toBe(40);

	// Verify final state
	const customerAfterAdvance =
		await autumnV1Beta.customers.get<ApiCustomerV3>(customerId);

	// Product should be removed
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	// Should have 2 invoices: initial ($20) + final overage ($40)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedOverage,
		latestInvoiceProductId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Track → cancel end of cycle → advance (entity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages on entity (400 overage)
 * - Cancel entity's product end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $40 (400 overage * $0.10)
 * - Entity product removed after cycle ends
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: entity - track overage → cancel → advance")}`, async () => {
	const customerId = "cancel-eoc-cons-ent";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Verify pro is active on entity
	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Track 500 messages on entity (100 included, 400 overage)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Cancel entity's product end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify pro is canceling on entity
	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	// Advance to next invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const entityAfterAdvance = await autumnV1.entities.get(customerId, entityId);

	// Product should be removed from entity
	await expectProductNotPresent({
		customer: entityAfterAdvance,
		productId: pro.id,
	});

	// Check customer invoices (invoices are at customer level)
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + final overage ($40)
	expect(customerAfterAdvance.invoices?.length).toBe(2);

	// Final invoice should be overage: 400 * $0.10 = $40
	expect(customerAfterAdvance.invoices?.[0].total).toBe(40);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Two entities, both overage, cancel end of cycle → advance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel both end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Both entities' overage billed in final invoices
 * - Both products removed after cycle ends
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: two entities, both overage → cancel → advance")}`, async () => {
	const customerId = "cancel-eoc-cons-2ent";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
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
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify pro is active on both entities
	const entity1 = await autumnV1.entities.get(customerId, entity1Id);
	const entity2 = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductActive({ customer: entity1, productId: pro.id });
	await expectProductActive({ customer: entity2, productId: pro.id });

	// Verify initial invoices: 2 invoices, $20 each for entity attaches
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
		latestTotal: 20,
	});

	// Track usage on entity 1: 300 messages (200 overage = $20)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	// Track usage on entity 2: 600 messages (500 overage = $50)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity2Id,
		feature_id: TestFeature.Messages,
		value: 600,
	});

	// Cancel both entities end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify both are canceling
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductCanceling({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Advance to next invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify both products removed
	const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductNotPresent({ customer: entity1Final, productId: pro.id });
	await expectProductNotPresent({ customer: entity2Final, productId: pro.id });

	// Calculate expected overage amounts
	// Entity 1: 300 messages - 100 included = 200 overage * $0.10 = $20
	// Entity 2: 600 messages - 100 included = 500 overage * $0.10 = $50
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 300 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 600 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(20);
	expect(entity2Overage).toBe(50);

	const totalOverage = entity1Overage + entity2Overage;
	expect(totalOverage).toBe(70);

	// Check customer invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 3 invoices:
	// - 2 initial invoices ($20 each for entity attaches)
	// - 1 final invoice ($70 for combined overage from both entities)
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3,
		latestTotal: totalOverage,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Two entities, cancel one end of cycle, keep one active
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel only Entity 1 end of cycle
 * - Keep Entity 2 active
 * - Advance to next invoice
 *
 * Expected Result:
 * - Entity 1's overage billed, product removed
 * - Entity 2 continues with subscription, renews normally
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: two entities, cancel one, keep one active")}`, async () => {
	const customerId = "cancel-eoc-cons-2ent-1cancel";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
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
			s.attach({ productId: pro.id, entityIndex: 1, timeout: 3000 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial invoices: 2 invoices, $20 each for entity attaches
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
		latestTotal: 20,
	});

	// Track usage on entity 1: 400 messages (300 overage = $30)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Messages,
		value: 400,
	});

	// Track usage on entity 2: 200 messages (100 overage = $10)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity2Id,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Cancel only entity 1 end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling, entity 2 is still active
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Advance to next invoice
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify entity 1 product removed, entity 2 still active
	const entity1Final = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Final = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductNotPresent({ customer: entity1Final, productId: pro.id });
	await expectProductActive({ customer: entity2Final, productId: pro.id });

	// Entity 2's balance should be reset (new cycle)
	expect(entity2Final.features[TestFeature.Messages].balance).toBe(100);

	// Calculate expected amounts
	// Entity 1: 400 messages - 100 included = 300 overage * $0.10 = $30
	// Entity 2: 200 messages - 100 included = 100 overage * $0.10 = $10
	// Entity 2 also renews: $20 base price
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 400 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	const entity2Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 200 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(30);
	expect(entity2Overage).toBe(10);

	// Check customer invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 3 invoices:
	// - 2 initial invoices ($20 each for entity attaches)
	// - 1 final invoice for entity 1 overage ($30) + entity 2 overage ($10) + entity 2 renewal ($20) = $60
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity + Customer consumables - cancel customer end of cycle (no double billing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages (uses invoice line items)
 * - Track overage on BOTH customer and entity
 * - Cancel CUSTOMER-level product end of cycle (entity stays active)
 * - Advance to next invoice
 *
 * Expected Result:
 * - Customer overage billed once (no double billing)
 * - Entity overage billed once
 * - Customer product removed, entity product renews
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel customer (no double billing)")}`, async () => {
	const customerId = "cancel-eoc-cons-ent-cus";

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
				cancelAction: "cancel_end_of_cycle",
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
		periodEndMs: addMonths(Date.now(), 1).getTime(),
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Entity + Customer consumables - cancel BOTH end of cycle (no double billing)
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
 * - Customer overage: $35 (350 * $0.10)
 * - Entity overage: $35 (350 * $0.10)
 * - Total final invoice: $35 (combined, no double billing)
 */
test.concurrent(`${chalk.yellowBright("cancel end of cycle consumable: entity + customer - cancel both (no double billing)")}`, async () => {
	const customerId = "cancel-eoc-cons-both";

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
				cancelAction: "cancel_end_of_cycle",
			}),
			s.updateSubscription({
				entityIndex: 0,
				productId: entityPro.id,
				cancelAction: "cancel_end_of_cycle",
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
		periodEndMs: addMonths(Date.now(), 1).getTime(),
	});
});
