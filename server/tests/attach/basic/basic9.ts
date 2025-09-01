import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";

const testCase = "basic9";
describe(`${chalk.yellowBright(
	"basic9: attach monthly with one time prepaid, and quantity = 0",
)}`, () => {
	const customerId = testCase;

	const options = [
		{
			feature_id: features.metered1.id,
			quantity: 0,
		},
		{
			feature_id: features.metered2.id,
			quantity: 4,
		},
	];
	before(async function () {
		await initCustomer({
			customerId,
			db: this.db,
			org: this.org,
			env: this.env,
		});
	});

	it("should attach monthly with one time", async () => {
		const res = await AutumnCli.attach({
			customerId,
			productId: products.monthlyWithOneTime.id,
			options,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(12000);
	});

	it("should have correct main product and entitlements", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);

		compareMainProduct({
			sent: products.monthlyWithOneTime,
			cusRes,
			optionsList: options,
		});
	});
});
