/**
 * Subscription Deleted Invoice Tests - Discounts on Consumable Overages
 *
 * Tests that verify discounts are correctly applied to consumable (usage-in-arrear)
 * overage charges when a subscription is deleted at the end of the billing period.
 *
 * Key behaviors tested:
 * - Customer-level discounts apply to final arrear invoice
 * - Subscription-level discounts apply to final arrear invoice
 * - Product-specific discounts (applies_to.products) only apply to matching products
 * - Entity-level consumables (non-metered) create arrear invoice via subscription.deleted
 *
 * Note: Entity-level consumables use invoice line items (not Stripe metered prices),
 * so Autumn handles the final arrear invoice creation in subscription.deleted webhook.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getEntitySubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { ProductService } from "@/internal/products/ProductService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer-level discount applies to final arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (100 included, $0.10/unit)
 * - Pro has a $20/month base price
 * - Apply 20% customer-level discount (applies to all subscriptions)
 * - Track 500 messages (400 overage)
 * - Cancel subscription at period end via Stripe client
 * - Advance test clock to trigger subscription.deleted
 *
 * Expected Result:
 * - Initial invoice: $20 * 0.8 = $16
 * - Final arrear invoice: 400 * $0.10 * 0.8 = $32
 * - Discount applies to overage
 */
test.concurrent(`${chalk.yellowBright("sub.deleted discount: customer-level discount applies to arrear invoice")}`, async () => {
	const customerId = "sub-del-disc-cus";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
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

	// Apply customer-level discount (20% off)
	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: coupon.id,
	});

	// Track 500 messages (400 overage = $40 before discount)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});

	// Verify usage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Get subscription ID for entity
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Verify subscription is scheduled for cancellation
	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);

	// Advance test clock to period end (triggers subscription.deleted)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
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

	// Verify final arrear invoice with discount
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected: 400 overage * $0.10 * 0.8 = $32
	const expectedArrearTotal = Math.round(400 * 0.1 * 0.8);

	// Should have 2 invoices: initial ($16) + arrear ($32)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Subscription-level discount applies to final arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (100 included, $0.10/unit)
 * - Pro has a $20/month base price
 * - Apply 30% subscription-level discount
 * - Track 300 messages (200 overage)
 * - Cancel subscription at period end via Stripe client
 * - Advance test clock to trigger subscription.deleted
 *
 * Expected Result:
 * - Final arrear invoice: 200 * $0.10 * 0.7 = $14
 * - Discount applies to overage
 */
test.concurrent(`${chalk.yellowBright("sub.deleted discount: subscription-level discount applies to arrear invoice")}`, async () => {
	const customerId = "sub-del-disc-sub";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
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

	// Get subscription ID for entity
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Apply subscription-level discount (30% off)
	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 30,
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	// Track 300 messages (200 overage = $20 before discount)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	// Verify usage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Advance test clock to period end (triggers subscription.deleted)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
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

	// Verify final arrear invoice with discount
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected: 200 overage * $0.10 * 0.7 = $14
	const expectedArrearTotal = Math.round(200 * 0.1 * 0.7);

	// Should have 2 invoices: initial ($14 with 30% off of $20) + arrear ($14)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Base price only discount does NOT apply to arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (100 included, $0.10/unit)
 * - Pro has a $20/month base price
 * - Apply 50% discount that only applies to the BASE PRICE Stripe product
 * - Track 200 messages (100 overage)
 * - Cancel subscription at period end via Stripe client
 * - Advance test clock to trigger subscription.deleted
 *
 * Expected Result:
 * - Final arrear invoice: 100 * $0.10 = $10 (NO discount - different product)
 */
test.concurrent(`${chalk.yellowBright("sub.deleted discount: base price only discount does NOT apply to arrear")}`, async () => {
	const customerId = "sub-del-disc-base";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
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
		actions: [s.attach({ productId: pro.id, entityIndex: 0, timeout: 5000 })],
	});

	const entityId = entities[0].id;

	// Verify pro is active on entity
	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Get subscription ID for entity
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Get the product's processor ID (used for base price line items)
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	const basePriceProductId = fullProduct?.processor?.id;
	if (!basePriceProductId) {
		throw new Error("Could not find base price Stripe product ID");
	}

	// Create coupon that ONLY applies to the base price product (product.processor.id)
	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 50,
		appliesToProducts: [basePriceProductId],
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	// Track 200 messages (100 overage = $10)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Verify usage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Advance test clock to period end (triggers subscription.deleted)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
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

	// Verify final arrear invoice WITHOUT discount (wrong product)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected: 100 overage * $0.10 = $10 (NO discount)
	const expectedArrearTotal = 100 * 0.1;

	// Should have 2 invoices: initial ($10 = $20 * 0.5) + arrear ($10 no discount)
	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Consumable price only discount applies to arrear invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages (100 included, $0.10/unit)
 * - Pro has a $20/month base price
 * - Apply 40% discount that only applies to the CONSUMABLE Stripe product
 * - Track 300 messages (200 overage)
 * - Cancel subscription at period end via Stripe client
 * - Advance test clock to trigger subscription.deleted
 *
 * Expected Result:
 * - Final arrear invoice: 200 * $0.10 * 0.6 = $12
 * - Discount applies ONLY to overage (matching product)
 */
test.concurrent(`${chalk.yellowBright("sub.deleted discount: consumable price only discount applies to arrear")}`, async () => {
	const customerId = "sub-del-disc-cons";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});
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

	// Get subscription ID for entity
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	// Get the consumable price's stripe_product_id from the product config
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	// Find the consumable price and get its stripe_product_id
	const consumablePrice = fullProduct?.prices.find(
		(price) => price.config?.stripe_product_id,
	);

	const consumableProductId = consumablePrice?.config?.stripe_product_id;
	if (!consumableProductId) {
		throw new Error("Could not find consumable Stripe product ID");
	}

	// Create coupon that ONLY applies to the consumable product (price.config.stripe_product_id)
	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 40,
		appliesToProducts: [consumableProductId],
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	// Track 300 messages (200 overage = $20 before discount)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	// Verify usage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	// Cancel subscription at PERIOD END via Stripe client
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	// Advance test clock to period end (triggers subscription.deleted)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
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

	// Verify final arrear invoice with discount
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected: 200 overage * $0.10 * 0.6 = $12
	const expectedArrearTotal = Math.round(200 * 0.1 * 0.6);

	// Should have 2 invoices: initial ($20 no discount) + arrear ($12 with discount)
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});
