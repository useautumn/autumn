import {
	type AppEnv,
	CusExpand,
	CusProductStatus,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "@tests/before.js";
import { expectProductV1Attached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals15";

describe(`${chalk.yellowBright(
	"referrals15: Testing referrals - referrer starts with no product, gets pro_amount discount - immediate, both - coupon-based",
)}`, () => {
	const mainCustomerId = "main-referral-15";
	const redeemer = "referral15-r1";
	const redeemerPM = "success";
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	const testClockIds: string[] = [];
	let referralCode: ReferralCode;

	let redemption: RewardRedemption;
	let db: DrizzleCli;
	let org: Organization;
	let env: AppEnv;

	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;
		db = this.db;
		org = this.org;
		env = this.env;

		try {
			await Promise.all([
				autumn.customers.delete(mainCustomerId, { deleteInStripe: true }),
				autumn.customers.delete(redeemer, { deleteInStripe: true }),
				RewardRedemptionService._resetCustomerRedemptions({
					db,
					internalCustomerId: [mainCustomerId, redeemer],
				}),
			]);
		} catch {}

		// Initialize main customer with NO paid product (just free tier)
		const res = await initCustomer({
			autumn: this.autumnJs,
			customerId: mainCustomerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockIds.push(res.testClockId);

		const redeemerRes = await initCustomer({
			autumn: this.autumnJs,
			customerId: redeemer,
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: redeemerPM,
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);
	});

	it("should advance clock 10 days before redeeming", async () => {
		// Advance 10 days after setup
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 10,
					waitForSeconds: 10,
					stripeCli,
				}),
			),
		);
	});

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateAll.id,
		});

		assert.exists(referralCode.code);

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateAll.id,
		});

		assert.equal(referralCode2.code, referralCode.code);
	});

	it("should create redemption for redeemer and fail if redeemed again", async () => {
		redemption = await autumn.referrals.redeem({
			customerId: redeemer,
			code: referralCode.code,
		});

		// Try redeem for redeemer again
		try {
			await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});
			assert.fail("Should not be able to redeem again");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

	it("should have both referrer and redeemer get pro product", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		assert.equal(redemptionResult.redeemer_applied, true);

		const mainCus = await autumn.customers.get(mainCustomerId);
		const redeemerCus = await autumn.customers.get(redeemer);
		const mainProds = mainCus.products;
		const redeemerProds = redeemerCus.products;

		// Main customer (referrer) should now have the pro product
		assert.equal(mainProds.length, 1);
		assert.equal(mainProds[0].id, products.pro.id);

		// Redeemer should also have the pro product (both get reward)
		assert.equal(redeemerProds.length, 1);
		assert.equal(redeemerProds[0].id, products.pro.id);

		expectProductV1Attached({
			customer: mainCus,
			product: products.pro,
			status: CusProductStatus.Active,
		});

		expectProductV1Attached({
			customer: redeemerCus,
			product: products.pro,
			status: CusProductStatus.Active,
		});
	});

	it("should advance test clock and verify both customers get pro_amount discount on Pro cycle", async () => {
		// Advance 31 days from current time to trigger next billing cycle
		// Coupon was applied on day 10, lasts 30 days, so should still be active on day 31
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 31,
					waitForSeconds: 25,
					stripeCli,
				}),
			),
		);

		// Test that both customers' Pro invoices have pro_amount discount applied
		const [mainCustomerWithInvoices, redeemerWithInvoices] = await Promise.all([
			autumn.customers.get(mainCustomerId, {
				expand: [CusExpand.Invoices],
			}),
			autumn.customers.get(redeemer, {
				expand: [CusExpand.Invoices],
			}),
		]);

		// console.log(
		// 	"Main Customer Invoices:\n",
		// 	mainCustomerWithInvoices.invoices
		// 		.map(
		// 			(x) =>
		// 				`${x.product_ids.join(", ")}: ${x.total} | ${new Date(x.created_at).toLocaleDateString()}`,
		// 		)
		// 		.join("\n"),
		// );

		// console.log(
		// 	"Redeemer Invoices:\n",
		// 	redeemerWithInvoices.invoices
		// 		.map(
		// 			(x) =>
		// 				`${x.product_ids.join(", ")}: ${x.total} | ${new Date(x.created_at).toLocaleDateString()}`,
		// 		)
		// 		.join("\n"),
		// );

		// Check main customer (referrer) invoice
		const mainProInvoice = mainCustomerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(products.pro.id),
		);
		if (mainProInvoice) {
			// Pro costs $10, so with pro_amount discount it should be $0 (Pro - Pro amount = $0)
			const proPrice = products.pro.prices[0].config.amount; // $10
			const proAmount = products.pro.prices[0].config.amount; // $10 (pro_amount discount)
			const expectedTotal = proPrice - proAmount; // $0

			// console.log("Main customer expected total:", expectedTotal);
			// console.log("Main customer Pro invoice total:", mainProInvoice.total);

			assert.equal(
				mainProInvoice.total,
				expectedTotal,
				`Main customer Pro invoice should be $0 (Pro $10 - Pro amount $10 discount). Got $${mainProInvoice.total}`,
			);
		}

		// Check redeemer invoice
		const redeemerProInvoice = redeemerWithInvoices.invoices.find((x) =>
			x.product_ids.includes(products.pro.id),
		);
		if (redeemerProInvoice) {
			// Pro costs $10, so with pro_amount discount it should be $0 (Pro - Pro amount = $0)
			const proPrice = products.pro.prices[0].config.amount; // $10
			const proAmount = products.pro.prices[0].config.amount; // $10 (pro_amount discount)
			const expectedTotal = proPrice - proAmount; // $0

			// console.log("Redeemer expected total:", expectedTotal);
			// console.log("Redeemer Pro invoice total:", redeemerProInvoice.total);

			assert.equal(
				redeemerProInvoice.total,
				expectedTotal,
				`Redeemer Pro invoice should be $0 (Pro $10 - Pro amount $10 discount). Got $${redeemerProInvoice.total}`,
			);
		}

		const dbCustomers = await Promise.all(
			[mainCustomerId, redeemer].map((x) =>
				CusService.getFull({
					db,
					idOrInternalId: x,
					orgId: org.id,
					env,
					inStatuses: [
						CusProductStatus.Active,
						CusProductStatus.PastDue,
						CusProductStatus.Expired,
					],
				}),
			),
		);

		const expectedProducts = [
			[
				// Main referrer - has Pro with pro_amount discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
			[
				// Redeemer - also has Pro with pro_amount discount applied
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
		];

		dbCustomers.forEach((customer, index) => {
			const expectedProductsForCustomer = expectedProducts[index];
			expectedProductsForCustomer.forEach((expectedProduct) => {
				const matchingProduct = customer.customer_products.find(
					(cp) =>
						cp.product.name === expectedProduct.name &&
						cp.status === expectedProduct.status,
				);
				const unMatchedProduct = customer.customer_products.find(
					(cp) => cp.product.name === expectedProduct.name,
				);

				assert.exists(
					matchingProduct,
					`Customer ${customer.name} should have ${expectedProduct.name} product with status ${expectedProduct.status}. ${unMatchedProduct ? `However ${unMatchedProduct.product.name} with status ${unMatchedProduct.status} was found instead` : ""}`,
				);
			});
		});
	});
});
