import {
    type AppEnv,
    CusProductStatus,
    ErrCode,
    type Organization,
    type ReferralCode,
    type RewardRedemption,
} from "@autumn/shared";
import type { Customer } from "autumn-js";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectAddOnAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { setTimeout } from "timers/promises";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "refferals7";

describe(`${chalk.yellowBright(
	"referrals7: Testing referrals (immediate, paid, one-off add-on, both)",
)}`, () => {
	const mainCustomerId = "main-referral-7";
	const redeemer = "referral7-r1";
	const redeemerPM = "success";
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	const testClockIds: string[] = [];
	let referralCode: ReferralCode;

	let redemption: RewardRedemption;
	let mainCustomer: any;
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
				autumn.customers.delete(mainCustomerId),
				autumn.customers.delete(redeemer),
				RewardRedemptionService._resetCustomerRedemptions({
					db,
					internalCustomerId: [mainCustomerId, redeemer],
				}),
			]);
		} catch {}

		const res = await initCustomer({
			autumn: this.autumnJs,
			customerId: mainCustomerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		mainCustomer = res.customer;
		testClockIds.push(res.testClockId);

		// await autumn.attach({
		// 	customer_id: mainCustomerId,
		// 	product_id: pro.id,
		// });

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

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidAddOnAll.id,
		});

		assert.exists(referralCode.code);

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidAddOnAll.id,
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

	it("should have given the paid add-on to both referrer and redeemer", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		assert.equal(redemptionResult.applied, true);

		await setTimeout(1000 * 10);

		const [mainCustomerData, redeemerCustomerData] = (await Promise.all([
			autumn.customers.get(mainCustomerId),
			autumn.customers.get(redeemer),
		])) as (Customer & { add_ons: any[] })[];

		// Main customer (referrer) should have the proAddOn product
		const mainProds = mainCustomerData.products;
		const mainAddons = mainCustomerData.add_ons;
		
		assert.equal(mainProds.length + mainAddons.length, 2);
		
		const hasProAddOn = mainAddons.some((p) => p.id === products.proAddOn.id);
		assert.isTrue(hasProAddOn, "Main customer should have proAddOn product");

		// Redeemer should have both free and proAddOn products
		const redeemerProds = redeemerCustomerData.products;
		const redeemerAddons = redeemerCustomerData.add_ons;
		
		assert.equal(redeemerProds.length + redeemerAddons.length, 2);
		
		const redeemerHasProAddOn = redeemerAddons.some(
			(p) => p.id === products.proAddOn.id,
		);
		const redeemerHasFree = redeemerProds.some(
			(p) => p.id === products.free.id,
		);

		assert.isTrue(redeemerHasProAddOn, "Redeemer should have proAddOn product");
		assert.isTrue(redeemerHasFree, "Redeemer should have free product");

		// Verify products are properly attached
		expectAddOnAttached({
			customer: await autumn.customers.get(mainCustomerId) as Customer & { add_ons: any[] },
			productId: products.proAddOn.id,
			status: CusProductStatus.Active,
		});

		expectAddOnAttached({
			customer: await autumn.customers.get(redeemer) as Customer & { add_ons: any[] },
			productId: products.proAddOn.id,
			status: CusProductStatus.Active,
		});
	});

	it("should advance test clock and have proAddOn attached for both", async () => {
		await Promise.all(
			testClockIds.map((x) =>
				advanceTestClock({
					testClockId: x,
					numberOfDays: 35,
					waitForSeconds: 15,
					stripeCli,
				}),
			),
		);

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
						CusProductStatus.Trialing,
						CusProductStatus.Expired,
					],
				}),
			),
		);

		const expectedProducts = [
			[
				// Main referrer - gets the proAddOn product
				{ name: "Free", status: CusProductStatus.Active },
				{ name: "proAddOn", status: CusProductStatus.Active },
			],
			[
				// Redeemer - gets both free and proAddOn products
				{ name: "Free", status: CusProductStatus.Active },
				{ name: "proAddOn", status: CusProductStatus.Active },
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

				assert.isNotNull(
					matchingProduct,
					`Customer ${customer.name} should have ${expectedProduct.name} product with status ${expectedProduct.status}`,
				);
			});
		});
	});
});
