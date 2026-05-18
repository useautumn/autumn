import { expect, test } from "bun:test";
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

	const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });
	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
	const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });

	// V2.3 cursor envelope: { list, next_cursor }, no offset/limit/total echoed.
	const customersV2_3 = (await autumnV2_3.customers.listV2({
		start_cursor: "",
		limit: 10,
		keepInternalFields: true,
	})) as {
		list: ApiCustomerV5[];
		next_cursor: string | null;
	};
	expect(Array.isArray(customersV2_3.list)).toBe(true);
	expect("next_cursor" in customersV2_3).toBe(true);
	expect(
		customersV2_3.next_cursor === null ||
			typeof customersV2_3.next_cursor === "string",
	).toBe(true);
	for (const customer of customersV2_3.list) {
		ApiCustomerV5Schema.parse(customer);
	}

	// V2.1 - should return ApiCustomerV5 schema (V1 balances with granted/remaining)
	const customersV2_1 = (await autumnV2_1.customers.listV2({
		keepInternalFields: true,
	})) as {
		list: ApiCustomerV5[];
	};
	for (const customer of customersV2_1.list) {
		ApiCustomerV5Schema.parse(customer);
	}

	// V2.0 - should return ApiCustomer schema (V0 balances with granted_balance/current_balance)
	const customersV2_0 = (await autumnV2_0.customers.list({
		keepInternalFields: true,
	})) as {
		list: ApiCustomer[];
	};
	for (const customer of customersV2_0.list) {
		ApiCustomerSchema.parse(customer);
	}

	// V1.2 - should return ApiCustomerV3 schema (features format)
	const customersV1_2 = (await autumnV1.customers.list({
		keepInternalFields: true,
	})) as {
		list: ApiCustomerV3[];
	};
	for (const customer of customersV1_2.list) {
		ApiCustomerV3Schema.parse(customer);
	}

	console.log(
		"Listed customersV2_3, customersV2_1, customersV2_0, and customersV1_2 successfully",
	);
});
