/**
 * Cancel Immediately Consumable Tests
 *
 * Tests for canceling products with consumable/arrear items immediately.
 * Key behavior: When canceling immediately, arrear overages are NOT charged.
 *
 * Key behaviors:
 * - Cancel immediately: NO overage billed (arrear overages not charged on immediate cancel)
 * - Only base price refund is issued
 * - Both customer-level and entity-level consumables are covered
 *
 * For end-of-cycle cancel tests (where overage IS charged), see:
 * - cancel/end-of-cycle/cancel-end-of-cycle-consumable.test.ts
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Track → cancel immediately (customer-level) - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages (400 overage)
 * - Cancel immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: -$20 (base refund only, no overage - arrear overages not charged on cancel)
 * - Product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel immediately consumable: customer - track overage → cancel immediately (no charges)")}`, async () => {
	const customerId = "cancel-imm-cons-cus";

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
	// Note: This overage will NOT be charged when canceling immediately
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

	// Final invoice = base refund only (-$20), no overage charged on cancel
	expect(preview.total).toBe(-20);

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

	// Should have 2 invoices: initial ($20) + final (refund -$20)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Verify final invoice matches preview (refund only)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Track → cancel immediately (entity) - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Track 500 messages on entity (400 overage)
 * - Cancel entity's product immediately
 *
 * Expected Result:
 * - Initial invoice: $20 (pro base price)
 * - Final invoice: -$20 (base refund only, no overage - arrear overages not charged on cancel)
 * - Entity product removed immediately
 */
test.concurrent(`${chalk.yellowBright("cancel immediately consumable: entity - track overage → cancel immediately (no charges)")}`, async () => {
	const customerId = "cancel-imm-cons-ent";

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
	// Note: This overage will NOT be charged when canceling immediately
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

	// Final invoice = base refund only (-$20), no overage charged on cancel
	expect(preview.total).toBe(-20);

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

	// Should have 2 invoices: initial ($20) + final (refund -$20)
	expect(customerAfterCancel.invoices?.length).toBe(2);

	// Verify final invoice matches preview (refund only)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Two entities, cancel one immediately, keep one active - no overage charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1 and Entity 2 both have Pro with consumable messages
 * - Track usage into overage on both entities
 * - Cancel only Entity 1 immediately
 * - Keep Entity 2 active
 *
 * Expected Result:
 * - Entity 1's final invoice: -$20 (base refund only, no overage charge)
 * - Entity 1 product removed immediately
 * - Entity 2 continues unaffected
 */
test.concurrent(`${chalk.yellowBright("cancel immediately consumable: two entities, cancel one, keep one active")}`, async () => {
	const customerId = "cancel-imm-cons-2ent-1cancel";

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

	// Track usage on entity 1: 500 messages (400 overage)
	// Note: This overage will NOT be charged when canceling immediately
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entity1Id,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Track usage on entity 2: 150 messages (50 overage)
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

	// Check customer invoices
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 3 invoices:
	// - 2 initial invoices ($20 each for entity attaches)
	// - 1 final invoice for entity 1 refund (-$20, no overage charged on cancel)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 3,
		latestTotal: -20,
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
// TEST 5: Entity within included usage, cancel immediately (no overage)
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
test.concurrent(`${chalk.yellowBright("cancel immediately consumable: entity - within included usage → cancel")}`, async () => {
	const customerId = "cancel-imm-cons-no-overage";

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
