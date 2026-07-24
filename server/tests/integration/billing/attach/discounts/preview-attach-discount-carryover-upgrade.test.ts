/**
 * TDD: a discount that was active for the period being credited must also
 * reduce the outgoing plan's proration credit on upgrade.
 *
 * User report: a customer is genuinely on a DISCOUNTED plan (they renew at
 * the discounted price each cycle). When they upgrade mid-cycle:
 *  - previewAttach shows the discount only on the previewed (new) plan in
 *    line_items, never on the current plan.
 *  - the current plan is credited at FULL list price — more than the customer
 *    actually paid — so the upgrade over-refunds.
 *
 * Root cause: proration credits (`direction: "refund"`) were never discounted.
 *   - server/src/internal/billing/v2/providers/stripe/utils/discounts/discountAppliesToLineItem.ts
 *   - server/src/internal/billing/v2/providers/stripe/utils/discounts/applyPercentOffDiscountToLineItems.ts
 *
 * The credit must be discounted ONLY when the discount was active for the
 * period being credited. A discount applied mid-cycle (after the period was
 * paid at full price) correctly leaves the credit at full price — that case
 * is covered by attach-discounts-stacking.test.ts and must stay green.
 *
 * Scenario (genuine discounted plan):
 *  - Attach Pro ($20/mo) WITH a 20% forever coupon → customer pays $16/cycle.
 *  - Renew once at the discounted price, then advance ~15 days into the cycle.
 *  - Preview the upgrade to Premium ($50/mo) WITHOUT a discounts param — the
 *    discount carries over from the existing subscription.
 *
 * Expected (green, after fix):
 *  - Premium charge carries the 20% discount  (already correct today)
 *  - Pro credit ALSO carries the 20% discount (smaller magnitude than the
 *    full-price credit)
 *  - preview.total = discounted credit + discounted charge
 *
 * Current buggy behavior (red, before fix):
 *  - Pro credit has zero discounts and stays at the full-price amount,
 *    over-refunding the customer.
 */

import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createPercentCoupon } from "../../utils/discounts/discountTestUtils.js";

const PERCENT_OFF = 20;
const DISCOUNT_RATE = PERCENT_OFF / 100;

test.concurrent(
	`${chalk.yellowBright(
		"preview-attach-discount-carryover-upgrade: a discount active for the credited period must reduce the outgoing plan credit, not only the new plan charge",
	)}`,
	async () => {
		const customerId = "preview-disc-carryover-upgrade";
		const proProd = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premiumProd = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [],
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: PERCENT_OFF,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		let advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			numberOfMonths: 1,
			waitForSeconds: 30,
		});
		advancedTo = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			startingFrom: new Date(advancedTo),
			numberOfDays: 15,
			waitForSeconds: 20,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const premiumLine = preview.line_items.find((li) =>
			li.plan_id.includes("premium"),
		);
		const proLine = preview.line_items.find(
			(li) => li.plan_id.includes("pro") && !li.plan_id.includes("premium"),
		);

		console.log(
			`[preview-disc-carryover-upgrade] proLine=${JSON.stringify(
				proLine && {
					subtotal: proLine.subtotal,
					total: proLine.total,
					discounts: proLine.discounts,
				},
			)} premiumLine=${JSON.stringify(
				premiumLine && {
					subtotal: premiumLine.subtotal,
					total: premiumLine.total,
					discounts: premiumLine.discounts.length,
				},
			)} previewTotal=${preview.total}`,
		);

		expect(premiumLine).toBeDefined();
		expect(proLine).toBeDefined();
		expect(proLine?.subtotal).toBeLessThan(0);
		expect(premiumLine?.subtotal).toBeGreaterThan(0);

		// New plan charge is discounted — already correct today.
		expect(premiumLine?.discounts.length).toBeGreaterThan(0);

		// The credit is sourced from the stored discounted renewal charge, so its
		// subtotal is already net of the discount.
		expect(proLine?.discounts.length).toBe(1);
		// Discount metadata retains the full-cycle amount: 20% of $20 = $4.
		expect(proLine?.discounts[0]?.amount_off).toBe(20 * DISCOUNT_RATE);

		expect(proLine?.total).toBe(proLine?.subtotal);
		expect(proLine?.total).toBeGreaterThan(-8.3);
		expect(proLine?.total).toBeLessThan(-7.4);

		// Total is the sum of the discounted credit and the discounted charge.
		expect(preview.total).toBeCloseTo(
			(proLine?.total ?? 0) + (premiumLine?.total ?? 0),
			1,
		);
	},
	300_000,
);
