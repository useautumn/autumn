/**
 * TDD scratch test for the post-checkout `once` re-redemption bug.
 *
 * Bug: when a customer attaches a plan via Stripe Checkout with a `once`
 * coupon, `modifyStripeSubscriptionFromCheckout` runs a post-checkout
 * subscription update that re-sends the resolved discounts via the
 * `discounts` param. Stripe treats that as a fresh redemption and attaches
 * a new `di_xxx` to the subscription, so the next renewal invoice applies
 * the coupon a second time.
 *
 * Expected after fix (`discounts: undefined` in the post-checkout update):
 *  - First (checkout) invoice = $16 (20% off $20)
 *  - Renewal invoice = $20 (no residual discount)
 */

import { test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test(
	`${chalk.yellowBright("temp integration: once coupon does not re-apply on renewal after checkout")}`,
	async () => {
		const customerId = "temp-checkout-once-renewal";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		// No payment method on the customer → attach will return a checkout URL
		// instead of charging immediately.
		const { autumnV1, autumnV2_2, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Stripe `once` 20% coupon — mirrors the merchant's real-world "Free Test"
		// configuration that originally surfaced this bug.
		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 20,
			duration: "once",
		});

		// Attach via V2 billing.attach with the coupon as a discount.
		// With no payment method, this returns a payment_url for Stripe Checkout.
		const attachResult = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		});

		if (!attachResult.payment_url) {
			throw new Error(
				"Expected payment_url from V2 attach (customer has no payment method)",
			);
		}

		// Complete the Stripe Checkout form via browser automation.
		await completeStripeCheckoutFormV2({ url: attachResult.payment_url });

		// Wait for checkout.session.completed webhook + modifyStripeSubscriptionFromCheckout.
		await timeout(12000);

		// Sanity: first invoice reflects the 20% discount (20 * 0.8 = 16).
		let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 16,
		});

		if (!testClockId) {
			throw new Error("Expected testClockId from initScenario");
		}

		// Advance the test clock to the next renewal. Stripe finalizes the
		// renewal invoice during this advance.
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId,
		});

		// The renewal invoice must NOT be discounted.
		// Without the fix: Stripe re-applied the `once` (Autumn re-sent it via
		// the post-checkout sub update), so this invoice comes in at $16.
		// With the fix: Stripe consumed the `once` on invoice #1 and the
		// renewal is the full $20.
		customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 20,
		});
	},
);
