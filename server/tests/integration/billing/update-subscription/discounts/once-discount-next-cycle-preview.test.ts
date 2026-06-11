/**
 * TDD test for: previewUpdateSubscription with a fresh `once`-duration coupon
 * via `discounts: [{ reward_id }]` not applying it to next_cycle (flim-ai).
 * A discount-only update creates no immediate invoice, so Stripe applies the
 * once coupon to the next renewal invoice — the preview should match.
 *
 * Red-failure mode (current behavior):
 *  - next_cycle.total stays 34.90 with no discounts; the execution test shows
 *    the actual renewal invoice IS discounted to 17.45.
 *
 * Green-success criteria (after fix):
 *  - next_cycle.total = 17.45 with the discount on the base-price line item.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	PreviewUpdateSubscriptionResponse,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("preview-update-once-discount: fresh once coupon with no immediate invoice applies to next_cycle")}`,
	async () => {
		const customerId = "preview-update-once-disc";

		const pro = products.base({
			id: "pro",
			items: [items.monthlyPrice({ price: 34.9 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			duration: "once",
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		})) as PreviewUpdateSubscriptionResponse;

		// Discount-only update: nothing due today.
		expect(preview.total).toBe(0);

		expect(preview.next_cycle, "next_cycle should be defined").toBeDefined();
		const nextCycle = preview.next_cycle!;

		expect(
			nextCycle.line_items.some((lineItem) => lineItem.discounts.length > 0),
		).toBe(true);
		expect(nextCycle.total).toBe(17.45);
	},
	300_000,
);

// Ground truth: executing the same update and advancing to renewal shows
// Stripe applies the once coupon to the renewal invoice (17.45, not 34.90).
test.concurrent(
	`${chalk.yellowBright("preview-update-once-discount: execution ground truth — renewal invoice is discounted")}`,
	async () => {
		const customerId = "update-once-disc-ground-truth";

		const pro = products.base({
			id: "pro",
			items: [items.monthlyPrice({ price: 34.9 })],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			duration: "once",
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfMonths: 1,
			numberOfHours: 2,
			waitForSeconds: 30,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 17.45,
		});
	},
	300_000,
);
