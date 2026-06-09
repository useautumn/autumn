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
	`${chalk.yellowBright("invoice-matched-credits entities 1: single entity upgrade — credit from stored charge")}`,
	async () => {
		const customerId = "imc-ent-single-upg";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, entities, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				],
			});

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
			entity_id: entities[0].id,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-20);

		expect(preview.total).toBeDefined();
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits entities 2: entity with discount — credit reflects discounted amount")}`,
	async () => {
		const customerId = "imc-ent-disc-upg";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, entities, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
				],
				actions: [],
			});

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const coupon = await createPercentCoupon({ stripeCli, percentOff: 20 });

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			entity_id: entities[0].id,
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
			entity_id: entities[0].id,
		})) as AttachPreviewResponse;

		const creditLines = preview.line_items.filter((li) => li.total < 0);
		expect(creditLines.length).toBeGreaterThan(0);

		const creditTotal = creditLines.reduce((sum, li) => sum + li.total, 0);
		expect(creditTotal).toBeLessThan(0);
		expect(creditTotal).toBeGreaterThan(-16.01);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched-credits entities 3: entity add mid-cycle — no credit for new entity")}`,
	async () => {
		const customerId = "imc-ent-add-midcycle";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, entities, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				],
			});

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

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro_${customerId}`,
			entity_id: entities[1].id,
		});

		const creditLines = (result.invoice?.line_items ?? []).filter(
			(li: { total: number }) => li.total < 0,
		);
		expect(creditLines.length).toBe(0);

		expect(result.invoice?.total).toBeGreaterThanOrEqual(0);
	},
	300_000,
);
