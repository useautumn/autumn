import { compareMainProduct } from "tests/utils/compare.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { initCustomer } from "tests/utils/init.js";
import { alexProducts } from "./init.js";
import { CusProductStatus } from "@autumn/shared";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { timeout } from "tests/utils/genUtils.js";
import { runEventsAndCheckBalances } from "./utils.js";
import chalk from "chalk";

describe(chalk.yellowBright("Premium plan"), () => {
	let customerId = "alex-premium-customer";

	before("initializing customer", async function () {
		await initCustomer({
			customer_data: {
				id: customerId,
				name: "Alex Premium Customer",
				email: "alex-premium-customer@test.com",
			},
			db: this.db,
			org: this.org,
			env: this.env,
			// attachPm: true,
		});
	});

	it("should attach premium product", async function () {
		const res = await AutumnCli.attach({
			customerId,
			productId: alexProducts.premium.id,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(10000);

		const cusRes = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: alexProducts.premium,
			cusRes,
			status: CusProductStatus.Trialing,
		});
	});

	it("should send events and check balances", async function () {
		await runEventsAndCheckBalances({
			customerId,
			entitlements: Object.values(alexProducts.premium.entitlements),
		});
	});
});
