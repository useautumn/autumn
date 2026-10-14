import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-set-balance-after-track: a target set right after a track is the balance that stands")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV1 } = await initScenario({
			customerId: "legacy-set-balance-after-track",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});
		await autumnV1.customers.setBalance({
			customerId,
			balances: [{ feature_id: TestFeature.Messages, balance: 100 }],
		});

		const customer = await autumnV1.customers.get(customerId);
		expect(customer.features[TestFeature.Messages].balance).toBe(100);
	},
);
