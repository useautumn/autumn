/**
 * Tests for billing.preview_attach discount precision and downgrade tax credits.
 *
 * Red-failure mode (current behavior):
 *  - A 3620-cent coupon appears as 36; downgrade tax credits appear as 0.
 *
 * Green-success criteria (after fix):
 *  - The preview preserves coupon cents and includes negative tax credits.
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1, AttachPreviewResponse } from "@autumn/shared";
import { createAmountCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

test.concurrent(
	`${chalk.yellowBright("preview_attach fixed amount discount: preserves cents")}`,
	async () => {
		const customerId = "preview-attach-fixed-discount-cents";
		const planId = "fixed-discount-cents-plan";
		const plan = products.base({
			id: planId,
			items: [items.monthlyPrice({ price: 155 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 3620,
		});

		const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1>({
			customer_id: customerId,
			plan_id: `${planId}_${customerId}`,
			redirect_mode: "never",
			discounts: [{ reward_id: coupon.id }],
		});

		const lineItem = preview.line_items[0];

		expect(preview.line_items).toHaveLength(1);
		expect(lineItem.discounts).toHaveLength(1);
		expect(lineItem.discounts[0].amount_off).toBe(36.2);
		expect(lineItem.total).toBe(118.8);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview_attach downgrade tax: includes negative tax on credit invoice")}`,
	async () => {
		const customerId = "preview-attach-downgrade-negative-tax";
		const proId = "pro-negative-tax";
		const premiumId = "premium-negative-tax";
		const pro = products.pro({ id: proId, items: [] });
		const premium = products.premium({
			id: premiumId,
			items: [],
		});

		const { autumnV2_2, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Preview Attach Downgrade Negative Tax",
			percentage: 20,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `${premiumId}_${customerId}`,
			redirect_mode: "never",
			tax_rate_id: taxRate.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			numberOfDays: 5,
			waitForSeconds: 15,
		});

		const preview = (await autumnV2_2.billing.previewAttach<AttachParamsV1>({
			customer_id: customerId,
			plan_id: `${proId}_${customerId}`,
			redirect_mode: "never",
			plan_schedule: "immediate",
			tax_rate_id: taxRate.id,
		})) as AttachPreviewResponse;

		const lineItemsTotal = preview.line_items.reduce(
			(sum, item) => sum + item.total,
			0,
		);
		const expectedTax = Math.round(lineItemsTotal * 0.2 * 100) / 100;

		expect(lineItemsTotal).toBeLessThan(0);
		expect(preview.tax).toBeDefined();
		expect(preview.tax?.total).toBe(expectedTax);
		expect(preview.tax?.amount_exclusive).toBe(expectedTax);
		expect(preview.total).toBe(
			Math.round((lineItemsTotal + expectedTax) * 100) / 100,
		);
	},
	300_000,
);
