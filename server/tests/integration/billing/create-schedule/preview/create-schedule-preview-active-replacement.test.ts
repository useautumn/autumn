import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectPreviewToMatchCreateSchedule } from "./utils/createSchedulePreviewUtils";

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 7: active upgrade preview matches the immediate replacement invoice")}`,
	async () => {
		const pro = products.pro({
			id: "preview-active-upgrade-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-active-upgrade-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-active-upgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: premium.id }],
					},
				],
			},
			assertPreview: (preview) => {
				expect(preview.total).toBeGreaterThan(0);
				expect(preview.total).toBeLessThan(50);
				expect(preview.line_items.length).toBeGreaterThan(0);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 8: active downgrade preview matches the immediate replacement invoice")}`,
	async () => {
		const pro = products.pro({
			id: "preview-active-downgrade-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "preview-active-downgrade-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-active-downgrade",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.billing.attach({ productId: premium.id })],
		});

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [{ plan_id: pro.id }],
					},
				],
			},
			assertPreview: (preview) => {
				expect(preview.total).toBeLessThan(20);
				expect(preview.line_items.length).toBeGreaterThan(0);
			},
		});
	},
);
