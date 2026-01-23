/**
 * Subscription Deleted Invoice Tests
 *
 * Tests for invoice creation when subscriptions are deleted via Stripe client
 * (not through Autumn's cancel API).
 *
 * Key behaviors:
 * - Immediate cancellation (cancel_at_period_end = false) → NO final arrear invoice
 * - End-of-period cancellation (cancel_at_period_end = true) → Final arrear invoice created
 * - Customer-level consumables use Stripe metered prices → Stripe handles final billing
 * - Entity-level consumables use invoice line items → Autumn creates final invoice (only for end-of-period)
 *
 * The wasImmediateStripeCancellation() check ensures we don't charge overage
 * on immediate cancellations, matching the behavior of customer-level consumables.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import {
	getEntitySubscriptionId,
	getSubscriptionId,
} from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer consumable → Stripe cancel immediately → NO final invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with customer-level consumable messages (uses Stripe metered prices)
 * - Track overage usage
 * - Cancel subscription IMMEDIATELY via Stripe client
 *
 * Expected Result:
 * - Product is removed
 * - Autumn does NOT create a final arrear invoice (metered + immediate cancel)
 * - Only the initial attach invoice exists
 */
test(`${chalk.yellowBright("sub.deleted invoice: customer consumable → Stripe cancel immediately → no final invoice")}`, async () => {
	const customerId = "sub-del-inv-cus-imm";

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

	// Track 500 messages (100 included, 400 overage = $40 if billed)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Get subscription ID
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	// Cancel subscription IMMEDIATELY via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify product is removed
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

	// Key assertion: Only 1 invoice (initial attach)
	// No final arrear invoice because:
	// 1. Customer-level consumables use metered prices (Stripe handles)
	// 2. This was an immediate cancel (wasImmediateStripeCancellation = true)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity consumable → Stripe cancel immediately → NO final invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (uses invoice line items, NOT metered)
 * - Track overage usage on entity
 * - Cancel subscription IMMEDIATELY via Stripe client
 *
 * Expected Result:
 * - Product is removed from entity
 * - Autumn does NOT create a final arrear invoice (immediate cancel = no overage charge)
 * - Only the initial attach invoice exists
 *
 * This matches the behavior of customer-level consumables where immediate
 * cancellation does not charge overage.
 */
test(`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel immediately → no final invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-imm";

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

	// Verify initial attach invoice: $20 base price
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages on entity (100 included, 400 overage = $40 if billed)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Get subscription ID for entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Cancel subscription IMMEDIATELY via Stripe client (not at period end)
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify product is removed from entity
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

	// Key assertion: Autumn should NOT have created an arrear invoice
	// because this was an immediate cancellation (cancel_at_period_end = false)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have only 1 invoice (initial attach) - no final arrear invoice
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 20, // Initial attach only
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multi-interval → advance 1 month → Stripe cancel immediately → no invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has product with multi-interval items (monthly + annual)
 * - Track overage usage
 * - Advance test clock exactly 1 month (monthly item period ends, annual continues)
 * - Cancel subscription IMMEDIATELY via Stripe client
 *
 * Expected Result:
 * - Product is removed
 * - Autumn does NOT create a final arrear invoice (immediate cancel)
 * - Only initial attach + renewal invoices exist
 *
 * This tests that the wasImmediateStripeCancellation check works correctly
 * even when subscription items have different period ends.
 */
test(`${chalk.yellowBright("sub.deleted invoice: multi-interval → advance 1 month → Stripe cancel immediately → no invoice")}`, async () => {
	const customerId = "sub-del-inv-multi-int";

	// Multi-interval: monthly consumable + annual base price
	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const annualPriceItem = items.annualPrice({ price: 120 });

	const pro = products.base({
		id: "pro",
		items: [consumableItem, annualPriceItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
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

	// Verify initial attach invoice: $120 annual base price
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 120,
	});

	// Track 500 messages on entity (100 included, 400 overage = $40 if billed)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Advance test clock exactly 1 month
	// This will trigger the monthly item's period end, but annual continues
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 15,
	});

	// Get invoice count after 1 month advance
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountAfterAdvance = customerAfterAdvance.invoices?.length ?? 0;

	// Get subscription ID for entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Cancel subscription IMMEDIATELY via Stripe client (mid-annual-cycle)
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify product is removed from entity
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

	// Key assertion: No NEW invoice should be created by Autumn for arrear usage
	// because this was an immediate cancellation (cancel_at_period_end = false)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Invoice count should be same as before cancel (no new arrear invoice)
	expect(customerAfterCancel.invoices?.length).toBe(invoiceCountAfterAdvance);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity consumable → advance 1 month → Stripe cancel immediately → no invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (uses invoice line items)
 * - Track overage usage on entity
 * - Advance test clock 1 month (triggers renewal)
 * - Cancel subscription IMMEDIATELY via Stripe client
 *
 * Expected Result:
 * - Product is removed from entity
 * - Autumn does NOT create a final arrear invoice (immediate cancel)
 * - Only initial attach + renewal invoices exist
 */
test(`${chalk.yellowBright("sub.deleted invoice: entity consumable → advance 1 month → Stripe cancel immediately → no invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-adv";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
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

	// Initial attach invoice: $20 base price
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Advance test clock 1 month (triggers renewal)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 15,
	});

	// Track 500 messages on entity in the new cycle (100 included, 400 overage)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Get invoice count before cancel
	const customerBeforeCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBeforeCancel = customerBeforeCancel.invoices?.length ?? 0;

	// Get subscription ID for entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Cancel subscription IMMEDIATELY via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify product is removed from entity
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

	// Key assertion: No NEW invoice from Autumn
	// Invoice count should be same as before cancel (no arrear invoice)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterCancel.invoices?.length).toBe(invoiceCountBeforeCancel);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Customer trial consumable → cancel at period end → NO arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with 14-day trial + consumable messages (100 included)
 * - Track overage usage during trial (250 messages = 150 overage)
 * - Cancel subscription at PERIOD END via Stripe client (cancel_at_period_end = true)
 * - Advance test clock to trial end (period end)
 *
 * Expected Result:
 * - Product is removed at trial end
 * - Autumn does NOT create an arrear invoice (trial usage is free)
 * - No invoices created (trial = no charge)
 */
test(`${chalk.yellowBright("sub.deleted invoice: customer trial consumable → cancel at period end → NO arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-cus-trial";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify pro is active and trialing
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: proTrial.id,
	});

	// No invoices yet (trialing)
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 0,
	});

	// Track 250 messages (100 included, 150 overage = $15 if billed)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 250,
	});

	// Verify usage was tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-150);

	// Get subscription ID
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: proTrial.id,
	});

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Verify subscription is still trialing but scheduled for cancellation
	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("trialing");

	// Advance test clock to trial end (14 days)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
		waitForSeconds: 15,
	});

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: proTrial.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Key assertion: No arrear invoice created because trial usage is free
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 0, // No invoices at all (trial was canceled before converting)
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Entity trial consumable → cancel at period end → NO arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with 14-day trial + consumable messages (100 included)
 * - Track overage usage on entity during trial (200 messages = 100 overage)
 * - Cancel subscription at PERIOD END via Stripe client (cancel_at_period_end = true)
 * - Advance test clock to trial end (period end)
 *
 * Expected Result:
 * - Product is removed from entity at trial end
 * - Autumn does NOT create an arrear invoice (trial usage is free)
 * - No invoices created (trial = no charge)
 */
test(`${chalk.yellowBright("sub.deleted invoice: entity trial consumable → cancel at period end → NO arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-trial";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entityId = entities[0].id;

	// Verify pro is active and trialing on entity
	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: proTrial.id,
	});

	// No invoices yet (trialing)
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 0,
	});

	// Track 200 messages on entity (100 included, 100 overage = $10 if billed)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	// Get subscription ID for entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: proTrial.id,
	});

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Verify subscription is still trialing but scheduled for cancellation
	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("trialing");

	// Advance test clock to trial end (14 days)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
		waitForSeconds: 15,
	});

	// Verify product is removed from entity
	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: proTrial.id,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Key assertion: No arrear invoice created because trial usage is free
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 0, // No invoices at all (trial was canceled before converting)
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Entity consumable → Stripe cancel at period end → CREATES arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (uses invoice line items)
 * - Track overage usage on entity
 * - Cancel subscription at PERIOD END via Stripe client (cancel_at_period_end = true)
 * - Advance test clock to period end
 *
 * Expected Result:
 * - Product is removed at period end
 * - Autumn DOES create a final arrear invoice (end-of-period = overage billed)
 * - Invoice includes overage charges
 *
 * This is the opposite of the immediate cancel tests - end-of-period cancellation
 * should bill any accumulated overage.
 */
test(`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel at period end → CREATES arrear invoice")}`, async () => {
	const customerId = "sub-del-inv-ent-eop";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
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

	// Verify initial attach invoice: $20 base price
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: 20,
	});

	// Track 500 messages on entity (100 included, 400 overage = $40 if billed)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Get subscription ID for entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Cancel subscription at PERIOD END via Stripe client (NOT immediately)
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Verify subscription is still active but scheduled for cancellation
	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);
	expect(subAfterSchedule.status).toBe("active");

	// Advance test clock to period end (1 month)
	// This triggers the subscription.deleted event with cancel_at_period_end = true
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 15,
	});

	// Verify product is removed from entity
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

	// Key assertion: Autumn SHOULD have created an arrear invoice
	// because this was an end-of-period cancellation (cancel_at_period_end = true)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 2 invoices:
	// 1. Initial attach: $20
	// 2. Final arrear invoice: $40 (400 overage × $0.10)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: 40, // Arrear invoice for overage
	});
});
