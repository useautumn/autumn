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
import {
	createAmountCoupon,
	createPercentCoupon,
} from "../utils/discounts/discountTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 1: percent-off forever discount — credit reflects discounted price")}`,
	async () => {
		const customerId = "inv-cred-upg-pct";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
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
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

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
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		// Stored $16 renewal charge, with 4d invoice finalization + 15d elapsed.
		expect(creditTotal).toBeLessThan(-5);
		expect(creditTotal).toBeGreaterThan(-6.5);

		for (const creditLine of creditLines) {
			const discounts = creditLine.discounts ?? [];
			// Stored coupon is metadata; it is not applied again to the net credit.
			expect(discounts.length).toBe(1);
		}

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 2: no discount — credit reflects full price")}`,
	async () => {
		const customerId = "inv-cred-upg-full";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ toNextInvoice: true }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-20);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 3: amount-off coupon — credit reflects discounted price")}`,
	async () => {
		const customerId = "inv-cred-upg-amt";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
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
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createAmountCoupon({
			stripeCli,
			amountOffCents: 500,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

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
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-15);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 4: at cycle start — full credit equals full charged amount")}`,
	async () => {
		const customerId = "inv-cred-upg-start";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
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
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			discounts: [{ reward_id: coupon.id }],
		});

		await new Promise((resolve) => setTimeout(resolve, 5000));

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-20.01);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(Math.abs((result.invoice?.total ?? 0) - preview.total)).toBeLessThan(
			2,
		);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits upgrade 5: upgrade twice in one period — second upgrade nets prior refund")}`,
	async () => {
		const customerId = "inv-cred-upg-twice";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const growth = products.growth({
			id: "growth",
			items: [items.monthlyMessages({ includedUsage: 2000 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ toNextInvoice: true }),
				s.advanceTestClock({ days: 10 }),
			],
		});

		const firstUpgradeResult = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(firstUpgradeResult.invoice).toBeDefined();

		await new Promise((resolve) => setTimeout(resolve, 5000));

		const secondPreview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `growth_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = secondPreview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const positiveLines = secondPreview.line_items.filter((li) => li.total > 0);
		expect(positiveLines.length).toBeGreaterThan(0);

		const secondResult = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `growth_${customerId}`,
		});

		expect(secondResult.invoice?.total).toBeCloseTo(secondPreview.total, 0);
	},
	300_000,
);
