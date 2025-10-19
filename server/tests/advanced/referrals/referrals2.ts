import {
	type AppEnv,
	type Customer,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initCustomerV2 } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../global.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	"referrals2: Testing referrals (immediate redemption)",
)}`, () => {
	const mainCustomerId = "main-referral-2";
	const redeemers = ["referral2-r1", "referral2-r2", "referral2-r3"];
	const autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let testClockId: string;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];
	let mainCustomer: Customer;
	let org: Organization;
	let env: AppEnv;
	before(async function () {
		await setupBefore(this);
		stripeCli = this.stripeCli;
		org = this.org;
		env = this.env;

		const { testClockId: testClockId1, customer } = await initCustomerV2({
			customerId: mainCustomerId,
			db: this.db,
			org: this.org,
			env: this.env,
			autumn,
		});
		testClockId = testClockId1;
		mainCustomer = customer;

		const batchCreate = [];
		for (const redeemer of redeemers) {
			batchCreate.push(
				initCustomer({
					customerId: redeemer,
					db: this.db,
					org: this.org,
					env: this.env,
					attachPm: true,
				}),
			);
		}

		await Promise.all(batchCreate);
	});

	it("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.immediate.id,
		});

		assert.exists(referralCode.code);
	});

	it("should create redemption for each redeemer and fail if redeemed again", async () => {
		for (let i = 0; i < redeemers.length; i++) {
			const redeemer = redeemers[i];
			const count = i + 1;
			try {
				const redemption: RewardRedemption = await autumn.referrals.redeem({
					customerId: redeemer,
					code: referralCode.code,
				});
				redemptions.push(redemption);

				if (count > referralPrograms.immediate.max_redemptions) {
					assert.equal(redemption.triggered, false);
					assert.equal(redemption.applied, false);
				} else {
					assert.fail("Should not be able to redeem again");
				}
			} catch (error) {
				if (count > referralPrograms.immediate.max_redemptions) {
					assert.instanceOf(error, AutumnError);
					assert.equal(error.code, ErrCode.ReferralCodeMaxRedemptionsReached);
				}
			}
		}

		// Check stripe customer
		const legacyStripe = createStripeCli({
			org: org,
			env: env,
			legacyVersion: true,
		});

		const stripeCus = (await legacyStripe.customers.retrieve(
			mainCustomer.processor?.id,
			{
				expand: ["discount"],
			},
		)) as Stripe.Customer;

		assert.notEqual(stripeCus.discount, null);
	});

	let curTime = new Date();
	it("customer should have discount for first purchase", async () => {
		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.proWithTrial.id,
		});

		await timeout(3000);

		curTime = addDays(addDays(curTime, 7), 4);
		await advanceTestClock({
			testClockId,
			advanceTo: curTime.getTime(),
			stripeCli,
			waitForSeconds: 30,
		});

		// 1. Get invoice
		const { invoices } = await autumn.customers.get(mainCustomerId);

		assert.equal(invoices!.length, 2);
		assert.equal(invoices![0].total, 0);
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

	//   // 3. Advance test clock to 1 month + 7 days from start (trigger new invoice)
	//   curTime = addDays(curTime, 8);
	//   await advanceTestClock({
	//     testClockId,
	//     advanceTo: curTime.getTime(),
	//     stripeCli,
	//   });

	//   // // 3. Get invoice again
	//   let { invoices: invoices2 } = await autumn.customers.get(mainCustomerId);

	//   assert.equal(invoices2!.length, 3);
	//   assert.equal(invoices2![0].total, 0);
	// });
});
