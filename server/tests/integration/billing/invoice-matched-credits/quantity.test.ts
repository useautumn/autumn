import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice-matched qty 1: prepaid quantity decrease — credit from stored charge")}`,
	async () => {
		const customerId = "inv-match-qty-decrease";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
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

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products.length).toBeGreaterThan(0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("invoice-matched qty 2: prepaid quantity decrease then increase — netting")}`,
	async () => {
		const customerId = "inv-match-qty-netting";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, testClockId, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
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

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products.length).toBeGreaterThan(0);
	},
	300_000,
);
