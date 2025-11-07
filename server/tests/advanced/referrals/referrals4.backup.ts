import type { ReferralCode, RewardRedemption } from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { compareProductEntitlements } from "tests/utils/compare.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { timeout } from "tests/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV2 } from "../../../src/utils/scriptUtils/initCustomer.js";
import { features, products, referralPrograms } from "../../global.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	"referrals4: Testing free product referrals with trial",
)}`, () => {
	const mainCustomerId = "main-referral-4";
	// let redeemers = ["referral4-r1", "referral4-r2"];
	const redeemerId = "referral4-r1";

	let autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];

	let testClockId: string;
	before(async function () {
		await setupBefore(this);
		autumn = this.autumn;
		stripeCli = this.stripeCli;

		await initCustomerV2({
			autumn,
			customerId: mainCustomerId,
			org: this.org,
			env: this.env,
			db: this.db,
			attachPm: "success",
		});

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.proWithTrial.id,
		});

		const { testClockId: testClockId1 } = await initCustomerV2({
			autumn,
			customerId: redeemerId,
			db: this.db,
			org: this.org,
			env: this.env,
			attachPm: "success",
		});

		testClockId = testClockId1;
	});

	it("should create referral code", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.freeProduct.id,
		});

		assert.exists(referralCode.code);
	});

	it("should create redemption for each redeemer and fail if redeemed again", async () => {
		const redemption: RewardRedemption = await autumn.referrals.redeem({
			customerId: redeemerId,
			code: referralCode.code,
		});

		redemptions.push(redemption);
	});

	it("should not be triggered because of trial", async () => {
		await autumn.attach({
			customer_id: redeemerId,
			product_id: products.proWithTrial.id,
		});

		await timeout(3000);

		// Get redemption object
		const redemption = await autumn.redemptions.get(redemptions[0].id);

		assert.equal(redemption.triggered, false);
	});

	it("should be triggered after trial ends", async () => {
		const advanceTo = addHours(
			addDays(new Date(), 7),
			hoursToFinalizeInvoice,
		).getTime();
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo,
			waitForSeconds: 30,
		});

		const redemption = await autumn.redemptions.get(redemptions[0].id);

		assert.equal(redemption.triggered, true);

		compareProductEntitlements({
			customerId: mainCustomerId,
			product: products.freeAddOn,
			features,
			quantity: 1,
		});

		compareProductEntitlements({
			customerId: redeemerId,
			product: products.freeAddOn,
			features,
			quantity: 1,
		});
	});
});
