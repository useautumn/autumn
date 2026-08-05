/**
 * Subscription Deleted Invoice Tests
 *
 * SLICE 2 of 3 (advance-then-cancel + customer trial) — split from
 * subscription-deleted-invoice.test.ts so each slice gets its own worker.
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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: entity consumable → advance 1 month → Stripe cancel immediately → no invoice")}`,
	async () => {
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
			waitForSeconds: 30,
		});

		// Baseline for "no new invoice": attach ($20) + the renewal the advance
		// above produced ($20). The renewal invoice reaches Autumn by webhook, so
		// reading the count straight after the advance can still see only the
		// attach invoice — and then the renewal landing later reads as the arrear
		// invoice this test is asserting the absence of. Settling it here also
		// keeps the cycle reset (same webhook) from landing on top of the track
		// below.
		const invoiceCountBeforeCancel = 2;
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: invoiceCountBeforeCancel,
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

		// Get subscription ID for entity's product
		const subscriptionId = await getEntitySubscriptionId({
			ctx,
			customerId,
			entityId,
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
		// Invoice count should be same as before cancel (no arrear invoice).
		// `waitForCustomerProductExpired` above already means the sub.deleted
		// handler ran past its arrear-billing task, so this count is final.
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: invoiceCountBeforeCancel,
		});
	},
);

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: customer trial consumable → cancel at period end → NO arrear invoice")}`,
	async () => {
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
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 0,
			latestInvoiceProductId: proTrial.id,
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
		expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(
			-150,
		);

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
			numberOfDays: 20,
			waitForSeconds: 30,
		});

		// Product removal rides the customer.subscription.deleted webhook that the
		// trial end fires — the clock advance's fixed wait says nothing about it.
		// Polling for absence passes instantly on a stale read, so gate on the
		// customer product row actually reaching Expired first.
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
		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			count: 1,
			latestTotal: 0,
			latestInvoiceProductId: proTrial.id,
		});
	},
);
