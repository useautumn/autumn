import {
	type AppEnv,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../global.js";

const pro = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	"referrals1: Testing referrals (on checkout)",
)}`, () => {
	const mainCustomerId = "main-referral-1";
	const alternateCustomerId = "alternate-referral-1";
	const redeemers = ["referral1-r1", "referral1-r2", "referral1-r3"];
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let testClockId: string;
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

		addPrefixToProducts({
			products: [pro],
			prefix: mainCustomerId,
		});

		await createProducts({
			autumn: this.autumnJs,
			products: [pro],
			db,
			orgId: org.id,
			env,
			customerId: mainCustomerId,
		});

		const res = await initCustomer({
			autumn: this.autumnJs,
			customerId: mainCustomerId,
			fingerprint: "main-referral-1",
			db,
			org,
			env,
			attachPm: "success",
		});

		mainCustomer = res.customer;
		testClockId = res.testClockId;

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: pro.id,
		});

		const batchCreate = [];
		for (const redeemer of redeemers) {
			batchCreate.push(
				initCustomer({
					autumn: this.autumnJs,
					customerId: redeemer,
					db: this.db,
					org: this.org,
					env: this.env,
					attachPm: "success",
				}),
			);
		}

		batchCreate.push(
			initCustomer({
				autumn: this.autumnJs,
				customerId: alternateCustomerId,
				fingerprint: "main-referral-1",
				db: this.db,
				org: this.org,
				env: this.env,
				attachPm: "success",
			}),
		);
		await Promise.all(batchCreate);
	});

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.onCheckout.id,
		});

		assert.exists(referralCode.code);

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.onCheckout.id,
		});

		assert.equal(referralCode2.code, referralCode.code);
	});

	it("should fail if same customer tries to redeem code again", async () => {
		try {
			await autumn.referrals.redeem({
				customerId: mainCustomerId,
				code: referralCode.code,
			});
			assert.fail("Own customer should not be able to redeem code");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerCannotRedeemOwnCode);
		}

		try {
			await autumn.referrals.redeem({
				customerId: alternateCustomerId,
				code: referralCode.code,
			});
			assert.fail(
				"Own customer (same fingerprint) should not be able to redeem code",
			);
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerCannotRedeemOwnCode);
		}
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
			const redemption1 = await autumn.referrals.redeem({
				customerId: redeemers[0],
				code: referralCode.code,
			});
			assert.fail("Should not be able to redeem again");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

	// return;

	it("should be triggered (and applied) when redeemers check out", async () => {
		for (let i = 0; i < redeemers.length; i++) {
			const redeemer = redeemers[i];

			await autumn.attach({
				customer_id: redeemer,
				product_id: products.pro.id,
			});

			await timeout(3000);

			// Get redemption object
			const redemption = await autumn.redemptions.get(redemptions[i].id);

			// Check if redemption is triggered
			const count = i + 1;

			if (count > referralPrograms.onCheckout.max_redemptions) {
				assert.equal(redemption.triggered, false);
				assert.equal(redemption.applied, false);
			} else {
				assert.equal(redemption.triggered, true);
				assert.equal(redemption.applied, i === 0);
			}

			// Check stripe customer
			const stripeCus = (await stripeCli.customers.retrieve(
				mainCustomer.processor?.id,
			)) as Stripe.Customer;

			assert.notEqual(stripeCus.discount, null);
		}
	});

	let curTime = new Date();
	it("customer should have discount for first purchase", async () => {
		curTime = addDays(addDays(curTime, 7), 4);
		await advanceTestClock({
			testClockId,
			advanceTo: curTime.getTime(),
			stripeCli,
		});

		// 1. Get invoice
		const { invoices } = await autumn.customers.get(mainCustomerId);
		assert.equal(invoices.length, 2);
		assert.equal(invoices[0].total, 0);
	});

	// it("customer should have discount for second purchase", async function () {
	//   // 2. Check that customer has another discount
	//   let stripeCus = (await stripeCli.customers.retrieve(
	//     mainCustomer.processor?.id,
	//   )) as Stripe.Customer;

	//   assert.notEqual(stripeCus.discount, null);

	//   // 2. Advance test clock to 1 month from start (trigger discount.deleted event)
	//   curTime = addHours(addMonths(new Date(), 1), 2);
	//   await advanceTestClock({
	//     testClockId,
	//     advanceTo: curTime.getTime(),
	//     stripeCli,
	//   });

	//   // 3. Advance test clock to 1 month + 12 days from start (trigger new invoice)
	//   curTime = addDays(curTime, 12);
	//   await advanceTestClock({
	//     testClockId,
	//     advanceTo: curTime.getTime(),
	//     stripeCli,
	//   });

	//   // // 3. Get invoice again
	//   let { invoices: invoices2 } = await autumn.customers.get(mainCustomerId);

	//   assert.equal(invoices2.length, 3);
	//   assert.equal(invoices2[0].total, 0);
	// });
});

// const { testClockId: testClockId1, customer } =
//   await initCustomerWithTestClock({
//     customerId: mainCustomerId,
//     db: this.db,
//     org: this.org,
//     env: this.env,
//     fingerprint: "main-referral-1",
//   });
// testClockId = testClockId1;
// mainCustomer = customer;

// await autumn.attach({
//   customer_id: mainCustomerId,
//   product_id: products.proWithTrial.id,
// });

// initCustomer({
//   customer_data: {
//     id: alternateCustomerId,
//     name: "Alternate Referral 1",
//     email: "alternate-referral-1@example.com",
//     fingerprint: "main-referral-1",
//   },
//   db: this.db,
//   org: this.org,
//   env: this.env,
// })
