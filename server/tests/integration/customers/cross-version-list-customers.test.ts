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

	const autumnV2_1 = new AutumnInt({ version: ApiVersion.V2_1 });
	const autumnV2_0 = new AutumnInt({ version: ApiVersion.V2_0 });

	try {
		const customers = (await autumnV2_1.customers.list()) as {
			list: ApiCustomerV5[];
		};
		customers.list.map((customer) => ApiCustomerV5Schema.parse(customer));

		const customersV2_0 = (await autumnV2_0.customers.list()) as {
			list: ApiCustomer[];
		};
		customersV2_0.list.map((customer) => ApiCustomerSchema.parse(customer));
		const customersV1_2 = (await autumnV1.customers.list()) as {
			list: ApiCustomerV3[];
		};
		customersV1_2.list.map((customer) => ApiCustomerV3Schema.parse(customer));
	} catch (_e) {
		expect(_e).toBe(undefined);
	} finally {
		console.log(
			"Listed customers, customersV2_0, and customersV1_2 successfully",
		);
	}
});
