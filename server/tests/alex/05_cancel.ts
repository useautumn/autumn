import { CusProductStatus, type Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { alexProducts } from "./init.js";

// CANCEL AT
const getProductFromCusRes = ({
	cusRes,
	productId,
}: {
	cusRes: any;
	productId: string;
}) => {
	return cusRes.products.find((p: any) => p.id === productId);
};

describe(chalk.yellowBright("05_cancel"), () => {
	describe("Testing cancel_at_period_end and cancel now", () => {
		let stripeCli: Stripe;
		const customerId = "alex-cancel-customer";

		before("initializing customer", async function () {
			stripeCli = createStripeCli({
				org: this.org,
				env: this.env,
			});
			await initCustomer({
				customer_data: {
					id: customerId,
					name: "Alex Cancel Customer",
					email: "alex-cancel-customer@test.com",
				},
				db: this.db,
				org: this.org,
				env: this.env,
				attachPm: true,
			});
		});

		it("should attach pro product ", async () => {
			await AutumnCli.attach({
				customerId,
				productId: alexProducts.pro.id,
			});

			const cusRes = await AutumnCli.getCustomer(customerId);
			compareMainProduct({
				sent: alexProducts.pro,
				cusRes,
				status: CusProductStatus.Trialing,
			});
		});

		it("should cancel at period end", async () => {
			// 1. Get pro product
			const cusRes = await AutumnCli.getCustomer(customerId);
			const proProduct = getProductFromCusRes({
				cusRes,
				productId: alexProducts.pro.id,
			});

			for (const subId of proProduct.subscription_ids) {
				await stripeCli.subscriptions.update(subId, {
					cancel_at_period_end: true,
				});
			}

			await timeout(5000);

			const newCusRes = await AutumnCli.getCustomer(customerId);
			const newProProduct = getProductFromCusRes({
				cusRes: newCusRes,
				productId: alexProducts.pro.id,
			});

			expect(newProProduct).to.exist;
			expect(newProProduct.canceled_at).to.not.equal(null);
			expect(newProProduct.status).to.equal(CusProductStatus.Trialing);
		});

		it("should cancel now", async () => {
			const cusRes = await AutumnCli.getCustomer(customerId);
			const proProduct = getProductFromCusRes({
				cusRes,
				productId: alexProducts.pro.id,
			});

			for (const subId of proProduct.subscription_ids) {
				await stripeCli.subscriptions.cancel(subId);
			}

			await timeout(5000);

			const newCusRes = await AutumnCli.getCustomer(customerId);
			const newProProduct = getProductFromCusRes({
				cusRes: newCusRes,
				productId: alexProducts.pro.id,
			});

			expect(newProProduct).to.not.exist;

			const freeProduct = getProductFromCusRes({
				cusRes: newCusRes,
				productId: alexProducts.free.id,
			});

			expect(freeProduct).to.exist;
			expect(freeProduct.status).to.equal(CusProductStatus.Active);
		});
	});

	describe("Testing past due", () => {
		const customerId = "alex-past-due-customer";
		let customer: Customer;
		let testClockId: string;
		let stripeCli: Stripe;
		before("initializing customer", async function () {
			stripeCli = createStripeCli({
				org: this.org,
				env: this.env,
			});
			const { testClockId: testClockId_, customer: customer_ } =
				await initCustomerWithTestClock({
					customerId,
					org: this.org,
					env: this.env,
					db: this.db,
				});
			testClockId = testClockId_;
			customer = customer_;
		});

		it("should attach pro product ", async () => {
			await AutumnCli.attach({
				customerId,
				productId: alexProducts.pro.id,
			});
			await timeout(5000);

			const cusRes = await AutumnCli.getCustomer(customerId);
			compareMainProduct({
				sent: alexProducts.pro,
				cusRes,
				status: CusProductStatus.Trialing,
			});
		});

		it("should attach failed card", async () => {
			await attachFailedPaymentMethod({ stripeCli, customer });
		});

		it("should advance clock to next cycle", async () => {
			await advanceTestClock({
				stripeCli,
				testClockId,
				advanceTo: addHours(
					addDays(new Date(), 7),
					hoursToFinalizeInvoice,
				).getTime(),
			});

			await timeout(5000);
		});

		// // TODO: Edit so that it doesn't auto cancel for unit test org
		// it("should have expired / past_dued pro product", async function () {
		//   const cusRes = await AutumnCli.getCustomer(customerId);

		//   let org = this.org;

		//   console.log("Cancel on past due:", org.config.cancel_on_past_due);
		//   if (org.config.cancel_on_past_due) {
		//     const proProduct = getProductFromCusRes({
		//       cusRes,
		//       productId: alexProducts.pro.id,
		//     });

		//     expect(proProduct).to.not.exist;

		//     const freeProduct = getProductFromCusRes({
		//       cusRes,
		//       productId: alexProducts.free.id,
		//     });

		//     expect(freeProduct).to.exist;
		//     expect(freeProduct.status).to.equal(CusProductStatus.Active);
		//   } else {
		//     compareMainProduct({
		//       sent: alexProducts.pro,
		//       cusRes,
		//       status: CusProductStatus.PastDue,
		//     });
		//   }
		// });
	});
});
