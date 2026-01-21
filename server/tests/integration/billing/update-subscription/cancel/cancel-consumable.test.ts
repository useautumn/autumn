/**
 * Cancel Consumable Tests
 *
 * Tests for canceling products with consumable/arrear items (pay-per-use overage).
 * Consumable items create a final invoice at end of cycle for any overage usage.
 *
 * Key behaviors:
 * - Overage usage is billed at cycle end (arrear pricing)
 * - Cancel end of cycle: overage billed in final invoice when cycle ends
 * - Cancel immediately: overage billed in final invoice immediately
 * - No double charge for base price on cancel immediately (refund + final invoice)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
 *
 * Migrated from: cancel2.test.ts
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel end of cycle → advance (customer)")}`, async () => {
	const customerId = "cancel-cons-eoc-cus";

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
		cancel: "end_of_cycle",
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

	// Calculate expected overage amount using new synchronous utility
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
// TEST 2: Track → cancel immediately (customer-level) - no double charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: $20 (overage $40 - base refund $20)
 * - Product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel immediately (customer) - no double charge")}`, async () => {
	const customerId = "cancel-cons-imm-cus";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
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
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Final invoice = overage ($40) - base refund ($20) = $20
	expect(preview.total).toBe(20);

	// Execute cancel
	await autumnV1.subscriptions.update(cancelParams);

	// Verify pro is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Should have 2 invoices: initial ($20) + final (overage - refund)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Verify final invoice matches preview
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Track → cancel end of cycle → advance (entity)
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
 *
 * Migrated from: entity3.test.ts
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel end of cycle → advance (entity)")}`, async () => {
	const customerId = "cancel-cons-eoc-ent";

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
		cancel: "end_of_cycle",
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
// TEST 4: Track → cancel immediately (entity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages on entity (400 overage)
 * - Cancel entity's product immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice with overage charges
 * - Entity product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel immediately (entity)")}`, async () => {
	const customerId = "cancel-cons-imm-ent";

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

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};
	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Final invoice = overage ($40) - base refund ($20) = $20
	expect(preview.total).toBe(20);

	// Execute cancel
	await autumnV1.subscriptions.update(cancelParams);

	// Verify pro is removed from entity
	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Check customer invoices
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices: initial ($20) + final (overage - refund)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Verify final invoice matches preview
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Two entities, both overage, cancel end of cycle → advance
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
test.concurrent(`${chalk.yellowBright("cancel consumable: two entities, both overage, cancel end of cycle")}`, async () => {
	const customerId = "cancel-cons-2ent-eoc";

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
		cancel: "end_of_cycle",
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity2Id,
		product_id: pro.id,
		cancel: "end_of_cycle",
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
// TEST 6: Two entities, cancel one end of cycle, keep one active
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
test.concurrent(`${chalk.yellowBright("cancel consumable: two entities, cancel one end of cycle, keep one active")}`, async () => {
	const customerId = "cancel-cons-2ent-1eoc";

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
		cancel: "end_of_cycle",
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

	// Should have 4 invoices:
	// - 2 initial invoices ($20 each for entity attaches)
	// - 1 final invoice for entity 1 overage ($30) + entity 2 overage ($10) + entity 2 renewal ($20) = $60
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3,
		latestTotal: entity1Overage + entity2Overage + 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Two entities, cancel one immediately, keep one active
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel only Entity 1 immediately
 * - Keep Entity 2 active
 *
 * Expected Result:
 * - Entity 1's final invoice created, product removed immediately
 * - Entity 2 continues unaffected
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: two entities, cancel one immediately, keep one active")}`, async () => {
	const customerId = "cancel-cons-2ent-1imm";

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
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
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

	// Track usage on entity 1: 500 messages (400 overage = $40)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Track usage on entity 2: 150 messages (50 overage = $5)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity2Id,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Cancel only entity 1 immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel: "immediately",
	});

	// Verify entity 1 product removed immediately, entity 2 still active
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);
	await expectProductNotPresent({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Calculate expected overage for entity 1
	// Entity 1: 500 messages - 100 included = 400 overage * $0.10 = $40
	const entity1Overage = calculateExpectedInvoiceAmount({
		items: pro.items,
		usage: [{ featureId: TestFeature.Messages, value: 500 }],
		options: { includeFixed: false, onlyArrear: true },
	});
	expect(entity1Overage).toBe(40);

	// Check customer invoices
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 3 invoices:
	// - 2 initial invoices ($20 each for entity attaches)
	// - 1 final invoice for entity 1 overage ($40)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 3,
		latestTotal: entity1Overage,
	});

	// Verify entity 2 has the product and subscription exists
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		subCount: 1, // Entity 2's subscription should still exist
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Entity within included usage, cancel immediately (no overage)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with consumable messages (100 included)
 * - Track 50 messages (within included usage, no overage)
 * - Cancel immediately
 *
 * Expected Result:
 * - No overage invoice (usage within included)
 * - Only refund invoice for unused time (if applicable)
 * - Product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: entity within included usage, cancel immediately")}`, async () => {
	const customerId = "cancel-cons-no-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, entities } = await initScenario({
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

	// Track 50 messages (within 100 included, no overage)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	// Verify balance is correct (100 - 50 = 50)
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(50);

	// Cancel immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entityId,
		product_id: pro.id,
		cancel: "immediately",
	});

	// Verify product removed
	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	// Check invoices - should have initial ($20) and possibly refund, but NO overage charge
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify the final invoice (if exists) is a refund (negative or zero), not an overage charge
	if (customerAfterCancel.invoices && customerAfterCancel.invoices.length > 1) {
		const finalInvoice = customerAfterCancel.invoices[0];
		// Final invoice should be refund (negative) or small, not a large overage charge
		expect(finalInvoice.total).toBeLessThanOrEqual(0);
	}
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Track → cancel immediately with failed payment
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages
 * - Track usage into overage
 * - Switch to failing payment method
 * - Cancel immediately
 *
 * Expected Result:
 * - Final invoice created with overage charges
 * - Invoice shows as unpaid/failed
 * - Product still removed
 */
test.concurrent(`${chalk.yellowBright("cancel consumable: track → cancel immediately with failed payment")}`, async () => {
	const customerId = "cancel-cons-fail-pay";

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
			s.attachPaymentMethod({ type: "fail" }), // Switch to failing card
		],
	});

	// Verify pro is active
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	// Track 1000 messages (900 overage = $90)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000,
	});

	// Cancel immediately (with failing payment method)
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately",
	});

	// Verify product is removed despite payment failure
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify invoice was created (even if payment failed)
	expect(customerAfterCancel.invoices?.length).toBeGreaterThanOrEqual(2);

	// Find the final invoice (most recent)
	const finalInvoice = customerAfterCancel.invoices?.[0];

	// Final invoice should exist and contain overage charges
	// Status should be 'open' or 'uncollectible' due to failed payment (not 'paid')
	expect(finalInvoice?.status).not.toBe("paid");
});
