import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("async update: applies the balance update")}`,
	async () => {
		const product = products.base({
			id: "base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2, customerId } = await initScenario({
			customerId: "async-update",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		const response = await autumnV2.balances.update(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				current_balance: 40,
			},
			{ headers: { "x-async-balance-update": "true" } },
		);
		expect(response).toEqual({ success: true });

		await timeout(5_000);

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances[TestFeature.Messages].current_balance).toBe(40);
	},
);
