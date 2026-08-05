/**
 * Subscription Deleted Invoice Tests
 *
 * SLICE 1 of 3 (immediate-cancel cases) — see subscription-deleted-invoice-2.test.ts
 * and subscription-deleted-invoice-3.test.ts for the remaining slices.
 *
 * Tests for invoice creation when subscriptions are deleted via Stripe client
 * (not through Autumn's cancel API).
 *
 * Key behaviors:
 * - Immediate cancellation (cancel_at_period_end = false) → NO final arrear invoice
 * - End-of-period cancellation (cancel_at_period_end = true) → the accumulated
 *   overage MUST be billed somewhere
 * - Customer-level consumables use Stripe metered prices → Stripe handles final billing
 *
 * The wasImmediateStripeCancellation() check ensures we don't charge overage
 * on immediate cancellations, matching the behavior of customer-level consumables.
 *
 * NOTE on entity-level consumables: the older claim that "Autumn creates the
 * final invoice" for them is WRONG today. `CREATE_STRIPE_EMPTY_PRICES` is
 * `false` (server/src/external/stripe/createStripePrice/createStripePrice.ts),
 * so `consumablePriceToStripeItem` falls back to `config.stripe_price_id` — the
 * METERED in-arrear price — even on entity subscriptions. That makes
 * `stripeSubscriptionHasMeteredItems()` true for every consumable subscription,
 * and `processConsumablePricesForSubscriptionDeleted` returns on its very first
 * guard. Nothing on the subscription.deleted path raises an arrear invoice; the
 * only handler that can bill the overage is `invoice.created`, on whichever
 * invoice Stripe happens to raise at the boundary. See the end-of-period test
 * in subscription-deleted-invoice-3.test.ts — it is red on that gap, not on a race.
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
import { waitForCustomerProductExpired } from "@tests/integration/billing/utils/waitForCustomerProductExpired";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: customer consumable → Stripe cancel immediately → no final invoice")}`,
	async () => {
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
		expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(
			-400,
		);

		// Get subscription ID
		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		// Cancel subscription IMMEDIATELY via Stripe client
		await ctx.stripeCli.subscriptions.cancel(subscriptionId);

		await waitForCustomerProductExpired({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeSubscriptionId: subscriptionId,
		});

		// Verify product is removed
		await expectProductNotPresent({
			autumn: autumnV1,
			customerId,
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
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 20,
		});
	},
);

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel immediately → no final invoice")}`,
	async () => {
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

		await waitForCustomerProductExpired({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeSubscriptionId: subscriptionId,
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

		// Key assertion: Autumn should NOT have created an arrear invoice
		// because this was an immediate cancellation (cancel_at_period_end = false)
		// Should have only 1 invoice (initial attach) - no final arrear invoice
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 20, // Initial attach only
		});
	},
);

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: multi-interval → advance 1 month → Stripe cancel immediately → no invoice")}`,
	async () => {
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
			waitForSeconds: 30,
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

		await waitForCustomerProductExpired({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			stripeSubscriptionId: subscriptionId,
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

		// Key assertion: No NEW invoice should be created by Autumn for arrear usage
		// because this was an immediate cancellation (cancel_at_period_end = false)
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Invoice count should be same as before cancel (no new arrear invoice)
		expect(customerAfterCancel.invoices?.length).toBe(invoiceCountAfterAdvance);
	},
);
