/**
 * TDD test for: `discounts` param on `subscriptions.update` must apply a
 * coupon to the Stripe subscription AND be reflected in the next cycle's
 * invoice total.
 *
 * Bug (pre-fix):
 *   `AttachParamsV1Schema` has `discounts`, but `UpdateSubscriptionV1ParamsSchema`
 *   (and its V0 counterpart) did not. Zod stripped the key by default, so the
 *   API silently no-op'd. Additionally, `setupUpdateSubscriptionBillingContext`
 *   never passed `params` down to `setupStripeBillingContext`, so even after
 *   adding `discounts` to the schemas it would not have been read, and
 *   `setupStripeBillingContext` exited early via `skipBillingChanges=true`
 *   because `discounts` was missing from `FIELDS_WITH_BILLING_CHANGES`.
 *   Finally, a discount-only update ended up with `intent=None` and an empty
 *   customer-product `updates: {}`, tripping a drizzle "No values to set"
 *   error in the execute loop.
 *
 * Red-failure mode (pre-fix):
 *   - `subscriptions.update({ discounts })` returned 500 "No values to set"
 *   - Stripe subscription had zero discounts
 *   - Next-cycle invoice did not reflect the discount
 *
 * Green-success criteria (post-fix):
 *   1. `discounts` is on `UpdateSubscriptionV1ParamsSchema` +
 *      `UpdateSubscriptionV0ParamsSchema`, `UPDATE_FIELDS`, and
 *      `FIELDS_WITH_BILLING_CHANGES`.
 *   2. `setupUpdateSubscriptionBillingContext` passes `params` to
 *      `setupStripeBillingContext` so the discount can flow through.
 *   3. `executeAutumnBillingPlan` guards against empty `updates: {}` to
 *      avoid drizzle's "No values to set" error in intent=None flows.
 *   4. After `subscriptions.update({ discounts: [{ reward_id }] })`:
 *      - Stripe subscription has the coupon in `discounts[].source.coupon.id`.
 *      - Advancing to the next billing cycle produces an invoice whose
 *        total reflects the discount ($20 monthly pro - 50% off = $10).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import chalk from "chalk";
import {
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	`${chalk.yellowBright(
		"update-subscription-discounts: update applies discount to Stripe sub AND next-cycle invoice",
	)}`,
	async () => {
		const customerId = "tdd-update-sub-discounts";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		if (!testClockId) {
			throw new Error("testClockId not set — expected testClock: true");
		}

		// Starting state: 1 paid invoice for pro ($20) and no discount on Stripe sub.
		const initialCustomer = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
		);
		await expectCustomerInvoiceCorrect({
			customer: initialCustomer,
			count: 1,
			latestTotal: 20,
		});

		const { stripeCli, subscription: subBefore } = await getStripeSubscription({
			customerId,
			expand: ["data.discounts.source.coupon"],
		});
		expect(subBefore.discounts?.length ?? 0).toBe(0);

		// Apply a 50%-off "forever" coupon via subscriptions.update({ discounts }).
		// Pre-fix this returned 500; post-fix it attaches the coupon.
		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 50,
			duration: "forever",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		});

		// Assertion 1: Stripe subscription has the new coupon applied.
		const subAfter = await stripeCli.subscriptions.retrieve(subBefore.id, {
			expand: ["discounts.source.coupon"],
		});
		expect(subAfter.discounts?.length ?? 0).toBeGreaterThanOrEqual(1);

		const couponIdsOnSub = (subAfter.discounts ?? [])
			.map((d) => {
				if (typeof d === "string") return null;
				const c = d.source?.coupon;
				if (!c) return null;
				return typeof c === "string" ? c : c.id;
			})
			.filter((id): id is string => id !== null);
		expect(couponIdsOnSub).toContain(coupon.id);

		// Assertion 2: advance to the next billing cycle and verify the new
		// invoice reflects the 50% discount ($20 → $10). Without the fix the
		// coupon was never attached, so the renewal invoice would still be $20.
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			numberOfMonths: 1,
			numberOfHours: 2,
			waitForSeconds: 30,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 10,
		});
	},
);
