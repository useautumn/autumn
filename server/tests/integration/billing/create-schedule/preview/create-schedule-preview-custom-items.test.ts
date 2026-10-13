import { expect, test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

const sortStrings = (values: string[]) =>
	[...values].sort((a, b) => a.localeCompare(b));

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 9: mixed immediate phase only charges recurring and prepaid items")}`,
	async () => {
		const recurring = products.pro({
			id: "preview-mixed-recurring",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			group: "preview-mixed-recurring",
		});
		const prepaid = products.base({
			id: "preview-mixed-prepaid",
			items: [items.prepaidUsers()],
			group: "preview-mixed-prepaid",
		});
		const usageBased = products.base({
			id: "preview-mixed-usage",
			items: [items.consumableWords({ includedUsage: 100 })],
			group: "preview-mixed-usage",
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-mixed",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurring, prepaid, usageBased] }),
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
							{ plan_id: recurring.id },
							{
								plan_id: prepaid.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Users,
										quantity: 4,
									},
								],
							},
							{ plan_id: usageBased.id },
						],
					},
				],
			},
			expectedTotal: 60,
			expectedLineItemTotals: [20, 40],
			assertPreview: (preview) => {
				expect(
					preview.line_items.some(
						(lineItem) => lineItem.feature_id === TestFeature.Words,
					),
				).toBe(false);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 10: customize.items uses custom prepaid and one-off prices")}`,
	async () => {
		const base = products.base({
			id: "preview-custom-items-chargeable",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-custom-items-chargeable",
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
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: 300,
									},
									{
										feature_id: TestFeature.Words,
										quantity: 200,
									},
								],
								customize: {
									items: [
										itemsV2.prepaidMessages({
											amount: 12,
											billingUnits: 100,
										}),
										{
											feature_id: TestFeature.Words,
											included: 0,
											price: {
												amount: 15,
												interval: BillingInterval.OneOff,
												billing_method: BillingMethod.Prepaid,
												billing_units: 100,
											},
										},
										{
											feature_id: TestFeature.Users,
											included: 0,
											price: {
												amount: 7,
												interval: BillingInterval.Month,
												billing_method: BillingMethod.UsageBased,
												billing_units: 1,
											},
										},
									],
								},
							},
						],
					},
				],
			},
			expectedTotal: 66,
			expectedLineItemTotals: [30, 36],
			assertPreview: (preview) => {
				expect(
					sortStrings(
						preview.line_items.map((lineItem) => lineItem.feature_id ?? "base"),
					),
				).toEqual(sortStrings([TestFeature.Messages, TestFeature.Words]));
			},
		});
	},
);
