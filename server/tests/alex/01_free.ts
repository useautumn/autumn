import { AutumnCli } from "tests/cli/AutumnCli.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "tests/utils/init.js";
import { alexProducts } from "./init.js";
import { runEventsAndCheckBalances } from "./utils.js";
import chalk from "chalk";

describe(chalk.yellowBright("Free customer"), () => {
	let customerId = "alex-free-customer";
	before("initializing customer", async function () {
		await initCustomer({
			customer_data: {
				id: customerId,
				// name: null,
				// email: null,
			},
			db: this.db,
			org: this.org,
			env: this.env,
		});
	});

	// 1. Check that customer has correct product & entitlements
	it("GET customer has correct product & entitlements", async function () {
		const customer = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: alexProducts.free,
			cusRes: customer,
		});
	});

	// 3. Run /events for each feature, and check that the balance is updated correctly
	it("should run /events for each feature and have correct balance afterwards", async function () {
		let entitlements = Object.values(alexProducts.free.entitlements);

		await runEventsAndCheckBalances({
			customerId,
			entitlements,
		});
	});
});
