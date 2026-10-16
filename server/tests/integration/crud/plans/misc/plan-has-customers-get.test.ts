import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("plan has_customers: bodiless GET reads as no proposed changes")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const base = products.base({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId: `plan_has_customers_get_${suffix}`,
			setup: [s.customer({}), s.products({ list: [base] })],
			actions: [s.billing.attach({ productId: base.id })],
		});

		const expected = {
			current_version: 1,
			will_version: false,
			archived: false,
		};

		for (const autumn of [autumnV1, autumnV2_3]) {
			const viaGet = await autumn.get(`/products/${base.id}/has_customers`);
			expect(viaGet).toEqual(expected);
		}

		const withChanges = await autumnV2_3.post(
			`/products/${base.id}/has_customers`,
			{
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 500,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		);
		expect(withChanges.will_version).toBe(true);
	},
);
