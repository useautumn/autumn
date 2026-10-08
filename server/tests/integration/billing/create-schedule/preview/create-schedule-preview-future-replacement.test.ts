import { expect, test } from "bun:test";
import { ms, truncateMsToSecondPrecision } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	expectCloseToCents,
	expectPreviewToMatchCreateSchedule,
	previewCreateSchedule,
	proratedDelta,
} from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 13: active schedules can defer a future replacement without charging now")}`,
	async () => {
		const pro = products.pro({
			id: "preview-future-replacement-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-future-replacement-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-future-replacement",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		const transitionAt = truncateMsToSecondPrecision(advancedTo + ms.days(15));

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: pro.id }],
					},
					{
						starts_at: transitionAt,
						plans: [{ plan_id: premium.id }],
					},
				],
			},
			expectedTotal: 0,
			assertPreview: (preview) => {
				expect(preview.line_items).toHaveLength(0);
				expect(preview.next_cycle).toBeDefined();
				expect(preview.next_cycle?.starts_at).toBe(transitionAt);

				const renewalAt = addMonths(advancedTo, 1).getTime();
				const expectedTotal = proratedDelta({
					oldAmount: 20,
					newAmount: 50,
					start: advancedTo,
					end: renewalAt,
					transitionAt,
				});
				expectCloseToCents({
					actual: preview.next_cycle?.total ?? 0,
					expected: expectedTotal,
				});
				expect(
					preview.next_cycle?.line_items.some((line) => line.total > 0),
				).toBe(true);
				expect(
					preview.next_cycle?.line_items.some((line) => line.total < 0),
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 13b: stale immediate first phase does not backdate an existing subscription")}`,
	async () => {
		const pro = products.pro({
			id: "preview-stale-immediate-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-stale-immediate-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-stale-immediate",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const transitionAt = truncateMsToSecondPrecision(advancedTo + ms.days(15));
		const preview = await previewCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo - ms.minutes(2),
						plans: [{ plan_id: pro.id }],
					},
					{
						starts_at: transitionAt,
						plans: [{ plan_id: premium.id }],
					},
				],
			},
		});

		expect(preview.line_items).toHaveLength(0);
		expect(preview.next_cycle?.starts_at).toBe(transitionAt);
	},
);
