/**
 * TDD test for syncing Stripe's billing_cycle_anchor onto the subscriptions
 * table at every write point.
 *
 * Contract under test:
 *   New types/fields:
 *     - subscriptions.billing_cycle_anchor_seconds: nullable numeric, unix
 *       SECONDS (same unit as current_period_start/current_period_end),
 *       mirroring Stripe.Subscription.billing_cycle_anchor.
 *   New behaviors:
 *     - billing.attach creating a Stripe subscription -> row created with the
 *       Stripe subscription's anchor.
 *     - Manual Stripe-side anchor change (subscriptions.update with
 *       billing_cycle_anchor: "now", e.g. via the Stripe CLI) -> row re-synced
 *       through the customer.subscription.updated webhook.
 *     - billing.attach upgrade with billing_cycle_anchor: "now" (cycle reset
 *       through the attach flow) -> row reflects the new anchor.
 *     - Subscription schedule phase with billing_cycle_anchor: "phase_start"
 *       -> row reflects the reset anchor once the phase starts.
 *   Side effects:
 *     - DB only (subscriptions.billing_cycle_anchor_seconds). No API response
 *       changes.
 *     - Rows created without Stripe data keep the column null (nullable, no
 *       default) — covered by the schema, not asserted here.
 *
 * Pre-impl red: the column exists (migration 0053) but no write path
 * populates it, so every row assertion below reads null.
 * Post-impl green: initSubscription/initSubscriptionFromStripe carry the
 * anchor and SubService.updateFromStripe/upsertByStripeId persist it.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	customerProducts,
	ms,
} from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import { SubService } from "@/internal/subscriptions/SubService";

test.concurrent(
	`${chalk.yellowBright("billing_cycle_anchor sync: attach creates subscriptions row with Stripe anchor")}`,
	async () => {
		const customerId = "bca-sync-attach";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const stripeSubscription =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		expect(typeof stripeSubscription.billing_cycle_anchor).toBe("number");

		// ── Contract assertion: attach writes the anchor ─────────────────────
		// Pre-fix: row.billing_cycle_anchor is null (column never written).
		// Post-fix: equals the Stripe subscription's anchor (unix seconds).
		const row = await SubService.getByStripeId({
			db: ctx.db,
			stripeId: subscriptionId,
		});
		expect(row?.billing_cycle_anchor_seconds).toBe(
			stripeSubscription.billing_cycle_anchor,
		);
	},
	90_000,
);

test.concurrent(
	`${chalk.yellowBright("billing_cycle_anchor sync: manual Stripe anchor reset syncs via subscription.updated webhook")}`,
	async () => {
		const customerId = "bca-sync-manual-reset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10, waitForSeconds: 15 }),
			],
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const subscriptionBefore =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const originalAnchor = subscriptionBefore.billing_cycle_anchor;

		// Simulates `stripe subscriptions update <id> --billing-cycle-anchor=now`
		// — a change made outside Autumn entirely.
		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			billing_cycle_anchor: "now",
			proration_behavior: "none",
		});

		const subscriptionAfter =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const newAnchor = subscriptionAfter.billing_cycle_anchor;
		expect(newAnchor).toBeGreaterThan(originalAnchor);

		// ── Contract assertion: webhook re-syncs the anchor ──────────────────
		// Pre-fix: row.billing_cycle_anchor stays null forever.
		// Post-fix: subscription.updated -> SubService.updateFromStripe lands
		// the new anchor.
		const row = await pollUntil({
			fetch: () =>
				SubService.getByStripeId({ db: ctx.db, stripeId: subscriptionId }),
			until: (value) => value?.billing_cycle_anchor_seconds === newAnchor,
			timeoutMs: 30_000,
		});
		expect(row?.billing_cycle_anchor_seconds).toBe(newAnchor);
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("billing_cycle_anchor sync: attach upgrade with billing_cycle_anchor 'now' resets the stored anchor")}`,
	async () => {
		const customerId = "bca-sync-attach-reset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 7, waitForSeconds: 15 }),
			],
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const subscriptionBefore =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const originalAnchor = subscriptionBefore.billing_cycle_anchor;

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
			billing_cycle_anchor: "now",
			redirect_mode: "if_required",
		});

		const subscriptionAfter =
			await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
		const newAnchor = subscriptionAfter.billing_cycle_anchor;
		expect(newAnchor).toBeGreaterThan(originalAnchor);

		// ── Contract assertion: attach flow persists the reset anchor ────────
		// Pre-fix: null. Post-fix: the billing plan execution upserts the row
		// with the new anchor (webhook sync would also land it).
		const row = await pollUntil({
			fetch: () =>
				SubService.getByStripeId({ db: ctx.db, stripeId: subscriptionId }),
			until: (value) => value?.billing_cycle_anchor_seconds === newAnchor,
			timeoutMs: 30_000,
		});
		expect(row?.billing_cycle_anchor_seconds).toBe(newAnchor);
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("billing_cycle_anchor sync: schedule phase_start anchor reset syncs when the phase begins")}`,
	async () => {
		const customerId = "bca-sync-schedule-phase";
		const starter = products.pro({
			id: "starter",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const commercial = products.base({
			id: "commercial-quarterly",
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				constructPriceItem({
					price: 2000,
					interval: BillingInterval.Quarter,
				}),
			],
		});

		const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [starter, commercial] }),
			],
			actions: [],
		});
		if (!testClockId) throw new Error("Expected a test clock");

		const phaseStartsAt = advancedTo + ms.days(3);
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo - ms.days(2),
					plans: [{ plan_id: starter.id }],
				},
				{
					starts_at: phaseStartsAt,
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: commercial.id }],
				},
			],
		});

		const activeCustomerProductId = response.phases[0]?.customer_product_ids[0];
		expect(activeCustomerProductId).toBeDefined();
		const [activeCustomerProduct] = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.id, activeCustomerProductId!));
		const subscriptionId = activeCustomerProduct?.subscription_ids?.[0];
		expect(subscriptionId).toBeDefined();

		const subscriptionBefore = await ctx.stripeCli.subscriptions.retrieve(
			subscriptionId!,
		);
		const originalAnchor = subscriptionBefore.billing_cycle_anchor;

		// ── Contract assertion: createSchedule writes the initial anchor ─────
		// Pre-fix: null. Post-fix: matches Stripe from the moment the
		// subscription row is created.
		const rowBefore = await SubService.getByStripeId({
			db: ctx.db,
			stripeId: subscriptionId!,
		});
		expect(rowBefore?.billing_cycle_anchor_seconds).toBe(originalAnchor);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo: phaseStartsAt + ms.hours(1),
			waitForSeconds: 15,
		});

		const subscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
			subscriptionId!,
		);
		const newAnchor = subscriptionAfter.billing_cycle_anchor;
		expect(newAnchor).toBeGreaterThan(originalAnchor);

		// ── Contract assertion: phase transition re-syncs the anchor ─────────
		// Pre-fix: null. Post-fix: the subscription.updated webhook fired by
		// the schedule's phase change lands the phase_start anchor.
		const row = await pollUntil({
			fetch: () =>
				SubService.getByStripeId({ db: ctx.db, stripeId: subscriptionId! }),
			until: (value) => value?.billing_cycle_anchor_seconds === newAnchor,
			timeoutMs: 30_000,
		});
		expect(row?.billing_cycle_anchor_seconds).toBe(newAnchor);
	},
	180_000,
);
