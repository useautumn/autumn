import { test } from "bun:test";
import {
	type ApiCustomer,
	ApiCustomerSchema,
	type ApiCustomerV3,
	ApiCustomerV3Schema,
	ApiVersion,
} from "@autumn/shared";
import {
	type ApiCustomerV5,
	ApiCustomerV5Schema,
} from "@shared/api/customers/apiCustomerV5";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

test.concurrent(`${chalk.yellowBright("cross-version-list-customers: list customers cross version")}`, async () => {
	const { autumnV1 } = await initScenario({
		customerId: "cross-version-list-customers",
		setup: [s.customer({})],
		actions: [],
	});

	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
	const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });

	// V2.1 - should return ApiCustomerV5 schema (V1 balances with granted/remaining)
	const customersV2_1 = (await autumnV2_1.customers.listV2()) as {
		list: ApiCustomerV5[];
	};
	for (const customer of customersV2_1.list) {
		console.log(customer);
		ApiCustomerV5Schema.parse(customer);
	}

	// V2.0 - should return ApiCustomer schema (V0 balances with granted_balance/current_balance)
	const customersV2_0 = (await autumnV2_0.customers.list()) as {
		list: ApiCustomer[];
	};
	for (const customer of customersV2_0.list) {
		ApiCustomerSchema.parse(customer);
	}

	// V1.2 - should return ApiCustomerV3 schema (features format)
	const customersV1_2 = (await autumnV1.customers.list()) as {
		list: ApiCustomerV3[];
	};
	for (const customer of customersV1_2.list) {
		ApiCustomerV3Schema.parse(customer);
	}

	console.log(
		"Listed customersV2_1, customersV2_0, and customersV1_2 successfully",
	);
});
