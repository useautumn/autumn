import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
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
	`${chalk.yellowBright("invoice-matched-credits discount 1: catalog fallback when no stored row exists")}`,
	async () => {
		const customerId = "imc-disc-fallback";

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
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.line_items.length).toBeGreaterThan(0);
		expect(preview.total).toBeDefined();

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThanOrEqual(-20);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits discount 2: discounted quantity decrease — refund based on stored discounted charge")}`,
	async () => {
		const customerId = "imc-disc-qty-dec";

		const billingUnits = 100;
		const pricePerPack = 10;

		const prepaidMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits,
			price: pricePerPack,
		});

		const product = products.pro({
			id: "prepaid-disc",
			items: [prepaidMessages],
		});

		const initialQuantity = 500;
		const decreasedQuantity = 200;

		const { autumnV1, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [],
		});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `prepaid-disc_${customerId}`,
			options: [
				{ feature_id: TestFeature.Messages, quantity: initialQuantity },
			],
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

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: `prepaid-disc_${customerId}`,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: decreasedQuantity,
				},
			],
		});

		expect(preview.total).toBeLessThan(0);

		const fullPriceRefundBound =
			-((initialQuantity - decreasedQuantity) / billingUnits) * pricePerPack;
		expect(preview.total).toBeGreaterThan(fullPriceRefundBound);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits discount 3: trial sibling with discount — credit reflects discounted charge")}`,
	async () => {
		const customerId = "imc-disc-trial-sib";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premiumTrial = products.premiumWithTrial({
			id: "premium-trial",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			trialDays: 14,
			cardRequired: false,
		});

		const { autumnV1, autumnV2_2, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premiumTrial] }),
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
			plan_id: `premium-trial_${customerId}`,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-20);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `premium-trial_${customerId}`,
		});

		await new Promise((resolve) => setTimeout(resolve, 4000));
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits discount 4: discounted credit magnitude bounded by stored charge")}`,
	async () => {
		const customerId = "imc-disc-no-double";

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
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-16.01);

		const result = await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		expect(result.invoice?.total).toBeCloseTo(preview.total, 0);
	},
	300_000,
);
