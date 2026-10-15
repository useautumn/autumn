import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("create: id containing colons")}`,
	async () => {
		const customerId = "create:colon-id";
		const { autumnV1, autumnV2_3 } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		const data = await autumnV1.customers.create({
			id: customerId,
			name: "Colon Customer",
			email: "create-colon-id@example.com",
			withAutumnId: false,
		});
		expect(data.id).toBe(customerId);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.id).toBe(customerId);
	},
);
