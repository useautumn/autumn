import {
	type Customer,
	ErrCode,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { compareProductEntitlements } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomer } from "tests/utils/init.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { features, products, referralPrograms } from "../../global.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	"referrals3: Testing free product referrals",
)}`, () => {
	const mainCustomerId = "main-referral-3";
	const redeemers = ["referral3-r1", "referral3-r2", "referral3-r3"];
	let autumn: AutumnInt = new AutumnInt();
	let _stripeCli: Stripe;
	let _testClockId: string;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];
	let _mainCustomer: Customer;

	before(async function () {
		await setupBefore(this);
		autumn = this.autumn;
		_stripeCli = this.stripeCli;

		const { testClockId: testClockId1, customer } =
			await initCustomerWithTestClock({
				customerId: mainCustomerId,
				db: this.db,
				org: this.org,
				env: this.env,
				fingerprint: "main-referral-3",
			});
		_testClockId = testClockId1;
		_mainCustomer = customer;

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.proWithTrial.id,
		});

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
			referralId: referralPrograms.freeProduct.id,
		});

		assert.exists(referralCode.code);
	});

	it("should create redemption for each redeemer and fail if redeemed again", async () => {
		for (const redeemer of redeemers) {
			const redemption: RewardRedemption = await autumn.referrals.redeem({
				customerId: redeemer,
				code: referralCode.code,
			});

			redemptions.push(redemption);

			// assert.equal(redemption.triggered, false);
			// assert.equal(redemption.applied, false);
		}

		// Try redeem for redeemer1 again
		try {
			const _redemption1 = await autumn.referrals.redeem({
				customerId: redeemers[0],
				code: referralCode.code,
			});
			assert.fail("Should not be able to redeem again");
		} catch (error) {
			assert.instanceOf(error, AutumnError);
			assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
		}
	});

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

			if (count > referralPrograms.freeProduct.max_redemptions) {
				assert.equal(redemption.triggered, false);
				assert.equal(redemption.applied, false);
			} else {
				// 1. Check that main customer has free add on
				compareProductEntitlements({
					customerId: mainCustomerId,
					product: products.freeAddOn,
					features,
					quantity: count,
				});

				compareProductEntitlements({
					customerId: redeemer,
					product: products.freeAddOn,
					features,
				});
			}
		}
	});
});
