import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	callFlash,
	type FlashClient,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: creates a new customer whose id contains colons")}`,
	async () => {
		const customerId = "dfu-flash:colon-id";
		const free = products.base({
			id: "dfu-colon-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			setup: [
				s.deleteCustomer({ customerId }),
				s.products({ list: [free], prefix: "dfu-flash-colon-id" }),
			],
			actions: [],
		});

		const flashRes = await callFlash(autumnV2_2 as FlashClient, {
			customer_id: customerId,
			customer_data: { email: "dfu-flash-colon-id@example.com" },
			billables: [
				{
					plan: {
						plan_id: free.id,
						status: "active",
						balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
					},
				},
			],
		});
		expect(flashRes.errorMessage).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.id).toBe(customerId);
		await expectCustomerProducts({ customer, active: [free.id] });
	},
);
