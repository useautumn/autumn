import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 2: prepaid feature quantities bill immediately")}`,
	async () => {
		const prepaid = products.base({
			id: "preview-prepaid",
			items: [items.prepaidMessages()],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-prepaid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaid] }),
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
								plan_id: prepaid.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: 400,
									},
								],
							},
						],
					},
				],
			},
			expectedTotal: 40,
			expectedLineItemTotals: [40],
			assertPreview: (preview) => {
				expect(preview.line_items).toContainEqual(
					expect.objectContaining({
						feature_id: TestFeature.Messages,
						quantity: 400,
						total: 40,
					}),
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 12: prepaid quantities only charge for units above included usage")}`,
	async () => {
		const prepaid = products.base({
			id: "preview-prepaid-included-usage",
			items: [items.prepaidMessages({ includedUsage: 200 })],
			group: "preview-prepaid-included-usage",
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-prepaid-included-usage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaid] }),
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
								plan_id: prepaid.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: 200,
									},
								],
							},
						],
					},
				],
			},
			expectedTotal: 0,
			assertPreview: (preview) => {
				expect(
					preview.line_items.every((lineItem) => lineItem.total === 0),
				).toBe(true);
			},
		});
	},
);
