import { expect, test } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("check-race-condition2: concurrent /check calls should auto-create customer once")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeDefault = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const customerId = "check-race-condition2-setup";

	const { autumnV1, autumnV2 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [freeDefault], prefix: customerId }),
		],
		actions: [],
	});

	const [res1, res2] = await Promise.all([
		autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Auto Created Customer",
				email: `${customerId}@example.com`,
			},
		}),
		autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			customer_data: {
				name: "Auto Created Customer",
				email: `${customerId}@example.com`,
			},
		}),
	]);

	expect(res1.allowed).toBe(true);
	expect(res2.allowed).toBe(true);

	const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
	expect(customer.id).toBe(customerId);
	expect(customer.name).toBe("Auto Created Customer");
	expect(customer.email).toBe(`${customerId}@example.com`);
});
