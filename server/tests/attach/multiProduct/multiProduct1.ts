import type { Customer } from "@autumn/shared";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { attachProducts } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

/* 
FLOW:
1. Attach pro group 1 & pro group 2 at once -> should have both products as main
2. Upgrade pro group 1 -> premium group 1
3. Upgrade pro group 2 -> premium group 2
*/

const testCase = "multiProduct1";
describe(
	chalk.yellowBright(`${testCase}: Testing multi product attach, and upgrade`),
	() => {
		const customerId = testCase;
		let _customer: Customer;
		before(async function () {
			await setupBefore(this);
			const res = await initCustomer({
				customerId,
				db: this.db,
				org: this.org,
				env: this.env,
				autumn: this.autumnJs,
				attachPm: "success",
			});
			_customer = res.customer;
		});

		it("should attach pro group 1 and pro group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productIds: [attachProducts.proGroup1.id, attachProducts.proGroup2.id],
			});

			const cusRes = await AutumnCli.getCustomer(customerId);
			compareMainProduct({ sent: attachProducts.proGroup1, cusRes });
			compareMainProduct({ sent: attachProducts.proGroup2, cusRes });
		});

		it("should upgrade to premium group 1", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: attachProducts.premiumGroup1.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			compareMainProduct({ sent: attachProducts.premiumGroup1, cusRes });
		});

		it("should upgrade to premium group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: attachProducts.premiumGroup2.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			compareMainProduct({ sent: attachProducts.premiumGroup2, cusRes });
		});
	},
);
