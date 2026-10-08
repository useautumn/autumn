import { expect, test } from "bun:test";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 6: usage-based features stay out of the immediate total")}`,
	async () => {
		const usagePlan = products.pro({
			id: "preview-usage-plan",
			items: [items.consumableMessages({ includedUsage: 100, price: 0.5 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-usage-based",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [usagePlan] }),
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
						plans: [{ plan_id: usagePlan.id }],
					},
				],
			},
			expectedTotal: 20,
			expectedLineItemTotals: [20],
			assertPreview: (preview) => {
				expect(
					preview.line_items.every((lineItem) => lineItem.feature_id === null),
				).toBe(true);
				expectPreviewNextCycleCorrect({
					preview,
					startsAt: addMonths(advancedTo, 1).getTime(),
					total: 20,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 11: one-off plan charges now and has no next cycle")}`,
	async () => {
		const oneOff = products.base({
			id: "preview-one-off-base",
			items: [items.oneOffPrice({ price: 50 }), items.monthlyMessages()],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-one-off",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOff] }),
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
						plans: [{ plan_id: oneOff.id }],
					},
				],
			},
			expectedTotal: 50,
			expectedLineItemTotals: [50],
			assertPreview: (preview) => {
				expect(preview.next_cycle).toBeUndefined();
			},
		});
	},
);
