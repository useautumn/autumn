/**
 * Subscription Deleted Invoice Tests
 *
 * SLICE 3 of 3 (end-of-period cancellations) — split from
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
 * at the bottom of this file — it is red on that gap, not on a race.
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
	pollEntityUntil,
	waitForEntityUsageInDb,
} from "@tests/integration/billing/utils/pollEntityState";
import { getEntitySubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { waitForCustomerProductExpired } from "@tests/integration/billing/utils/waitForCustomerProductExpired";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { DEFAULT_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: entity trial consumable → cancel at period end → NO arrear invoice")}`,
	async () => {
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
		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 0,
			latestInvoiceProductId: proTrial.id,
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
			numberOfDays: 20,
			waitForSeconds: 30,
		});

		// Same webhook race as the customer-level trial test above — gate on the
		// customer product row expiring before asserting the product is gone.
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
		await expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1,
			latestTotal: 0,
			latestInvoiceProductId: proTrial.id,
		});
	},
);

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
test.concurrent(
	`${chalk.yellowBright("sub.deleted invoice: entity consumable → Stripe cancel at period end → CREATES arrear invoice")}`,
	async () => {
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
		await expectCustomerInvoiceCorrect({
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

		// Verify usage was tracked — gate on Postgres, not on the cached balance.
		// The final arrear invoice is billed from the DB row when
		// customer.subscription.deleted lands; a full-subject invalidation in the
		// track→sync window otherwise drops the deduction and the invoice is $0.
		await waitForEntityUsageInDb({
			autumn: autumnV1,
			customerId,
			entityId,
			featureId: TestFeature.Messages,
			balance: -400,
		});

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
			waitForSeconds: 30,
			autumn: autumnV1,
			customerId,
		});

		// Product removal rides the customer.subscription.deleted webhook, which the
		// clock advance's invoice signal says nothing about — poll for it.
		await pollEntityUntil({
			autumn: autumnV1,
			customerId,
			entityId,
			assert: (entity) =>
				expectProductNotPresent({
					customer: entity,
					productId: pro.id,
				}),
		});

		// Verify no Stripe subscription exists
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Key assertion: the 400 units of overage MUST be billed somewhere, because
		// this was an end-of-period cancellation (cancel_at_period_end = true).
		//
		// Asserted by content, not by position: which invoice carries the charge
		// depends on which handler wins the boundary. `invoice.created` attaches
		// the arrear line items to Stripe's own final cycle invoice, while
		// `customer.subscription.deleted` would raise a separate arrear invoice —
		// so "the latest invoice totals $40" is an assumption about the race, not
		// about the product. The totals are printed on failure so a red run says
		// whether the charge landed elsewhere or was lost entirely.
		//
		// KNOWN RED — this is a product gap, not test flakiness (see the note in
		// this file's header). subscription.deleted bails on its metered-items
		// guard, so `invoice.created` is the only handler that can bill this, and
		// it can only reach Stripe's own boundary invoice. The Stripe-side dump
		// below says which way that fails: a boundary invoice whose
		// `billing_reason` is not `subscription_cycle` means the arrear branch was
		// never entered, an `open`/`paid` boundary invoice plus a pending invoice
		// item means the line items orphaned onto an invoice that no longer exists.
		const expectedArrearTotal = 40; // 400 overage × $0.10
		try {
			await pollUntilAsserted({
				fetch: () => autumnV1.customers.get<ApiCustomerV3>(customerId),
				assert: (customer) => {
					const totals = (customer.invoices ?? []).map(
						(invoice) => invoice.total,
					);
					const billed = totals.some(
						(total) => Math.abs(total - expectedArrearTotal) < 0.01,
					);
					expect(
						billed,
						`No invoice carries the $${expectedArrearTotal} arrear charge for ${customerId} — invoice totals: [${totals.join(", ")}]`,
					).toBe(true);
				},
				// Same ceiling the pollable invoice helper used here before: the
				// advance already waited for the boundary invoice to finalize, so this
				// only covers the last webhook hop — and a charge that was LOST must
				// surface fast rather than burn the file's wall time.
				timeoutMs: DEFAULT_SETTLE_TIMEOUT_MS,
			});
		} catch (error) {
			const stripeCustomerId =
				typeof subAfterSchedule.customer === "string"
					? subAfterSchedule.customer
					: subAfterSchedule.customer.id;

			const [stripeInvoices, pendingInvoiceItems] = await Promise.all([
				ctx.stripeCli.invoices.list({ customer: stripeCustomerId, limit: 10 }),
				ctx.stripeCli.invoiceItems.list({
					customer: stripeCustomerId,
					pending: true,
					limit: 10,
				}),
			]);

			const invoiceSummary = stripeInvoices.data
				.map(
					(invoice) =>
						`${invoice.id} reason=${invoice.billing_reason} status=${invoice.status} total=${invoice.total}`,
				)
				.join(" | ");
			const pendingSummary = pendingInvoiceItems.data
				.map((item) => `${item.id} amount=${item.amount}`)
				.join(" | ");

			throw new Error(
				`${(error as Error).message}\nStripe invoices: [${invoiceSummary}]\nPending Stripe invoice items: [${pendingSummary}]`,
			);
		}
	},
);
