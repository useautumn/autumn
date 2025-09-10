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
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals5";

describe(`${chalk.yellowBright(
	"referrals5: Testing referrals (immediate, paid, recurring, both)",
)}`, () => {
	const mainCustomerId = "main-referral-5";
	const redeemers = ["referral5-r1", "referral5-r2", "referral5-r3"];
	const redeemerPMs = ["success", undefined, "fail"];
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	const testClockIds: string[] = [];
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];
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

		[mainCustomerId, ...redeemers].forEach(async (customerId) => {
			await autumn.customers.delete(customerId);
		});

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

		const batchCreate = [];
		for (const redeemer of redeemers) {
			batchCreate.push(
				initCustomer({
					autumn: this.autumnJs,
					customerId: redeemer,
					db: this.db,
					org: this.org,
					env: this.env,
					attachPm: redeemerPMs[redeemers.indexOf(redeemer)] as
						| "success"
						| "fail"
						| undefined,
					withTestClock: true,
				}),
			);
		}

		const batchRes = await Promise.all(batchCreate);
		for (const r of batchRes) {
			testClockIds.push(r.testClockId);
		}
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

	it("should create redemption for each redeemer and fail if redeemed again", async () => {
		for (const redeemer of redeemers) {
			const redemption: RewardRedemption = await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});

			redemptions.push(redemption);
		}

		// Try redeem for redeemer1 again
		try {
			await autumn.referrals.redeem({
				customerId: redeemers[0],
				code: referralCode.code,
			});
			assert.fail("Should not be able to redeem again");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

	it("should have given the paid product to all redeemers", async () => {
		for (const redeemer of redeemers) {
			const redemption = await autumn.redemptions.get(
				redemptions[redeemers.indexOf(redeemer)].id,
			);
			assert.equal(redemption.applied, true);
		}

		const mainProds = (await autumn.customers.get(mainCustomerId)).products;
		const redeemerProds = (await autumn.customers.get(redeemers[0])).products;

		assert.equal(mainProds.length, 1);
		assert.equal(redeemerProds.length, 1);
		assert.equal(mainProds[0].id, products.pro.id);
		assert.equal(redeemerProds[0].id, products.pro.id);

		expectProductV1Attached({
			customer: await autumn.customers.get(mainCustomer.id),
			product: products.pro,
			status: CusProductStatus.Trialing,
		});

		redeemers.forEach(async (r) => {
			expectProductV1Attached({
				customer: await autumn.customers.get(r),
				product: products.pro,
				status: CusProductStatus.Trialing,
			});
		});
	});

	it("should advance test clock and have pro attached", async () => {
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
			[mainCustomerId, ...redeemers].map((x) =>
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
				// Main referrer.
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
			[
				// Referrer 1, valid payment method.
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Active },
			],
			[
				// Referrer 2, no valid payment method.
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Expired },
				{ name: "Free", status: CusProductStatus.Active },
			],
			[
				// Referrer 3, no valid payment method.
				{ name: "Free", status: CusProductStatus.Expired },
				{ name: "Pro", status: CusProductStatus.Expired },
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