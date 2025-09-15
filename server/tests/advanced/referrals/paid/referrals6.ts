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
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals6";

describe(`${chalk.yellowBright(
	"referrals6: Testing referrals (immediate, paid, recurring, referrer only)",
)}`, () => {
	const mainCustomerId = "main-referral-6";
	const redeemer = "referral6-r1";
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

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateReferrer.id,
		});

		assert.exists(referralCode.code);

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.paidProductImmediateReferrer.id,
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

	it("should have given the paid product to referrer only, not redeemer", async () => {
		const redemptionResult = await autumn.redemptions.get(redemption.id);
		assert.equal(redemptionResult.applied, true);

		const mainProds = (await autumn.customers.get(mainCustomerId)).products;
		const redeemerProds = (await autumn.customers.get(redeemer)).products;

		// Main customer (referrer) should have the pro product
		assert.equal(mainProds.length, 1);
		assert.equal(mainProds[0].id, products.pro.id);

		// Redeemer should only have the free product (no pro product given)
		assert.equal(redeemerProds.length, 1);
		assert.equal(redeemerProds[0].id, products.free.id);

		expectProductV1Attached({
			customer: await autumn.customers.get(mainCustomerId),
			product: products.pro,
			status: CusProductStatus.Trialing,
		});

		// Verify redeemer only has free product
		expectProductV1Attached({
			customer: await autumn.customers.get(redeemer),
			product: products.free,
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
				// Redeemer - only has free product (no reward)
				{ name: "Free", status: CusProductStatus.Active },
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