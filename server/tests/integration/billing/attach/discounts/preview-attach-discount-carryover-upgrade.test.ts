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

		expect(premiumLine?.discounts.length).toBeGreaterThan(0);

		expect(proLine?.discounts.length).toBe(1);
		expect(proLine?.discounts[0]?.amount_off).toBe(20 * DISCOUNT_RATE);

		expect(proLine?.total).toBe(proLine?.subtotal);
		expect(proLine?.total).toBeGreaterThan(-8.3);
		expect(proLine?.total).toBeLessThan(-7.4);

		expect(preview.total).toBeCloseTo(
			(proLine?.total ?? 0) + (premiumLine?.total ?? 0),
			1,
		);
	},
	300_000,
);
