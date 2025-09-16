import { setTimeout } from "node:timers/promises";
import {
	type AppEnv,
	CusProductStatus,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectProductV1Attached } from "tests/utils/expectUtils/expectProductAttached.js";
import {
	advanceTestClock,
	completeCheckoutForm,
} from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals11";

describe(`${chalk.yellowBright(
	"referrals11: Testing referrals (checkout, paid, recurring, both)",
)}`, () => {
	const mainCustomerId = "main-referral-11";
	const redeemer = "referral11-r1";
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
		});

		testClockIds.push(res.testClockId);

		const redeemerRes = await initCustomer({
			autumn: this.autumnJs,
			customerId: redeemer,
			db: this.db,
			org: this.org,
			env: this.env,
			withTestClock: true,
		});

		testClockIds.push(redeemerRes.testClockId);
	});

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductCheckoutAll.id,
		});

		assert.exists(referralCode.code, "Referral code should be generated");

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductCheckoutAll.id,
		});

		assert.equal(
			referralCode2.code,
			referralCode.code,
			"Should return same referral code when called multiple times",
		);
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
			assert.instanceOf(
				error,
				AutumnError,
				"Should throw AutumnError when trying to redeem same code twice",
			);
			assert.equal(
				error.code,
				ErrCode.CustomerAlreadyRedeemedReferralCode,
				"Should return correct error code for duplicate redemption",
			);
		}
	});

	it("should succesfully checkout and trigger the checkout reward", async () => {
		const res = await autumn.attach({
			customer_id: redeemer,
			product_id: products.premium.id,
		});

		await completeCheckoutForm(res.checkout_url);
		await setTimeout(1000 * 5);
	});

	it("should have given the paid product to referrer only, not redeemer (on paid plan)", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		assert.equal(
			redemptionResult.applied,
			true,
			`Redemption ${redemption.id} should be applied`,
		);

		await setTimeout(1000 * 10);

		const [mainCustomerData, redeemerCustomerData] = await Promise.all([
			autumn.customers.get(mainCustomerId),
			autumn.customers.get(redeemer),
		]);

		// Main customer (referrer) should have the pro product
		const mainProds = mainCustomerData.products;

		assert.equal(
			mainProds.length,
			1,
			"Main customer should have exactly 1 product (Pro)",
		);

		const hasProProduct = mainProds.some((p) => p.id === products.pro.id);
		assert.isTrue(hasProProduct, "Main customer should have pro product");

		// Redeemer should only have Premium product (no pro product because they're on paid plan)
		const redeemerProds = redeemerCustomerData.products;

		assert.equal(
			redeemerProds.length,
			1,
			"Redeemer should have exactly 1 product (Premium only)",
		);

		const redeemerHasProProduct = redeemerProds.some(
			(p) => p.id === products.pro.id,
		);
		const redeemerHasPremium = redeemerProds.some(
			(p) => p.id === products.premium.id,
		);

		assert.isFalse(
			redeemerHasProProduct,
			"Redeemer should not have pro product (already on paid plan)",
		);
		assert.isTrue(redeemerHasPremium, "Redeemer should have premium product");

		// Verify products are properly attached
		expectProductV1Attached({
			customer: mainCustomerData,
			product: products.pro,
			status: CusProductStatus.Trialing,
		});

		// Verify redeemer only has premium product
		expectProductV1Attached({
			customer: redeemerCustomerData,
			product: products.premium,
			status: CusProductStatus.Active,
		});
	});

	it("should advance test clock and have pro attached for referrer only", async () => {
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
				// Main referrer - gets the pro product
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
			[
				// Redeemer - only has Premium product (no Pro reward due to being on paid plan)
				{ name: "Premium", status: CusProductStatus.Active },
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
