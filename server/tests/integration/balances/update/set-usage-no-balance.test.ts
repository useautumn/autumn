/**
 * `/usage` on a feature the customer holds no balance for is a no-op success on both routes: a 404 makes clients retry.
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("set-usage-no-balance1: /usage on a feature with no balance succeeds and changes nothing")}`,
	async () => {
		const free = products.base({
			id: "set-usage-no-balance",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "set-usage-no-balance1";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.billing.attach({ productId: free.id })],
		});

		const result = await autumnV2_3.usage({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});
		expect(result).toMatchObject({ success: true });

		const customer = await autumnV2_3.customers.get(customerId);
		expect(customer.features?.[TestFeature.Action1]).toBeUndefined();
	},
);
