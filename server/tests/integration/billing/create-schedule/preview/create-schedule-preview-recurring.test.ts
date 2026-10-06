import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 1: immediate recurring plans match preview total")}`,
	async () => {
		const pro = products.pro({
			id: "preview-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "preview-addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-recurring",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
					},
					{
						starts_at: advancedTo + ms.days(30),
						plans: [{ plan_id: pro.id }],
					},
				],
			},
			expectedTotal: 40,
			expectedLineItemTotals: [20, 20],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 3: customize.price overrides the template base price")}`,
	async () => {
		const base = products.base({
			id: "preview-custom-price",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-custom-price",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base] }),
			],
			actions: [],
		});

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [
							{
								plan_id: base.id,
								customize: {
									price: itemsV2.monthlyPrice({ amount: 35 }),
								},
							},
						],
					},
				],
			},
			expectedTotal: 35,
			expectedLineItemTotals: [35],
		});
	},
);
