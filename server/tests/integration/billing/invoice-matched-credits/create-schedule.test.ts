import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createPercentCoupon } from "../utils/discounts/discountTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits create-schedule: immediate phase pro + addon — credits from stored discounted charges")}`,
	async () => {
		const customerId = "imc-sched-disc-addon";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, addon, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		const scheduleResponse = await autumnV1.billing.createSchedule(
			{
				customer_id: customerId,
				discounts: [{ reward_id: coupon.id }],
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
					},
				],
			},
			{ timeout: 8000 },
		);

		expect(scheduleResponse.status).toBe("created");
		expect(scheduleResponse.phases[0]!.customer_product_ids).toHaveLength(2);
		expect(scheduleResponse.invoice?.total).toBeLessThan(40);

		const renewalTime = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewalTime),
			numberOfDays: 15,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: premium.id,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(Math.abs(creditTotal)).toBeLessThan(40);

		for (const creditLine of creditLines) {
			// Stored coupon surfaces as metadata; no additional discount is applied.
			expect(creditLine.discounts ?? []).toHaveLength(1);
		}

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits create-schedule: multi-phase setup then mid-cycle upgrade — preview matches invoice")}`,
	async () => {
		const customerId = "imc-sched-multiphase";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 200 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, addon, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });
		const phase2StartsAt = addMonths(advancedTo, 2).getTime();

		await autumnV1.billing.createSchedule(
			{
				customer_id: customerId,
				discounts: [{ reward_id: coupon.id }],
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
					},
					{
						starts_at: phase2StartsAt,
						plans: [{ plan_id: pro.id }],
					},
				],
			},
			{ timeout: 8000 },
		);

		const renewalTime = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewalTime),
			numberOfDays: 15,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: premium.id,
		})) as AttachPreviewResponse;

		expect(preview.total).toBeDefined();
		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);
