import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 4: graduated prepaid tiers use the correct total")}`,
	async () => {
		const tiered = products.base({
			id: "preview-tiered-prepaid",
			items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-tiered-prepaid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [tiered] }),
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
								plan_id: tiered.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: 700,
									},
								],
							},
						],
					},
				],
			},
			expectedTotal: 60,
			expectedLineItemTotals: [60],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 5: volume prepaid tiers use the correct total")}`,
	async () => {
		const volume = products.base({
			id: "preview-volume-prepaid",
			items: [items.volumePrepaidMessages({ includedUsage: 0 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-volume-prepaid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [volume] }),
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
								plan_id: volume.id,
								feature_quantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: 700,
									},
								],
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
