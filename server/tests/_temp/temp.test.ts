/**
 * TDD scratch tests for the `one_off` reward leakage bug.
 *
 * Bug: an existing Stripe discount backed by a `once` coupon (with end=null)
 * is treated as active in next-cycle previews and billing.previewAttach
 * responses, even when no coupon is passed in the new request.
 *
 * Both tests should FAIL on current `dev` and PASS after the fix to
 * `filterStripeDiscountsForNextCycle.ts`.
 */

import { expect, test } from "bun:test";
import type { StripeDiscountWithCoupon } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { filterStripeDiscountsForNextCycle } from "@/internal/billing/v2/providers/stripe/utils/discounts/filterStripeDiscountsForNextCycle";

test.concurrent(
	`${chalk.yellowBright("temp unit: filterStripeDiscountsForNextCycle excludes existing once discount")}`,
	() => {
		const now = Date.now();
		const nextCycleStart = now + 30 * 24 * 60 * 60 * 1000;

		// Mirrors the real-world state reported in the bug:
		// - discount is already on the subscription (has an id)
		// - end is null (Stripe doesn't populate end for `once` coupons)
		// - coupon duration is "once"
		const existingOnceDiscount = {
			id: "di_existing_once",
			end: null,
			source: {
				coupon: {
					id: "coupon_early_bird",
					object: "coupon",
					duration: "once",
					percent_off: 20,
					amount_off: null,
					currency: null,
					valid: true,
					livemode: false,
					created: Math.floor(now / 1000),
					metadata: {},
					name: "Early Bird",
					times_redeemed: 1,
					max_redemptions: null,
					redeem_by: null,
					duration_in_months: null,
					applies_to: undefined,
				},
			},
		} as unknown as StripeDiscountWithCoupon;

		const result = filterStripeDiscountsForNextCycle({
			stripeDiscounts: [existingOnceDiscount],
			currentEpochMs: now,
			nextCycleStart,
		});

		expect(
			result.length,
			"existing `once` discount with end=null must NOT propagate to next cycle",
		).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("temp integration: existing once discount does not leak into previewAttach next_cycle")}`,
	async () => {
		const customerId = "temp-once-discount-leak";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Simulate the post-checkout state: a `once` 20% coupon is already
		// attached to the Stripe subscription (end=null on the discount).
		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});

		const coupon = await createPercentCoupon({
			stripeCli,
			percentOff: 20,
			duration: "once",
		});

		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [coupon.id],
		});

		// No discount passed in the preview request — the once should not
		// carry over into next-cycle line items or totals.
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});

		const nextCycle = expectPreviewNextCycleCorrect({ preview })!;

		expect(
			nextCycle.line_items.every(
				(lineItem) => lineItem.discounts.length === 0,
			),
			"no next-cycle line item should carry the consumed once discount",
		).toBe(true);

		expect(
			nextCycle.total,
			"next-cycle total must equal subtotal when no active discount remains",
		).toBe(nextCycle.subtotal);
	},
);
