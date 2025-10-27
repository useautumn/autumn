import type { Customer, ReferralCode, RewardRedemption } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import type { Stripe } from "stripe";
import { compareProductEntitlements } from "tests/utils/compare.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { timeout } from "tests/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { features, products, referralPrograms } from "../../global.js";

describe(`${chalk.yellowBright(
	"referrals4: Testing free product referrals with trial",
)}`, () => {
	const mainCustomerId = "main-referral-4";
	const redeemerId = "referral4-r1";

	let autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];
	let mainCustomer: Customer;
	let redeemer: Customer;

	let testClockId: string;

	beforeAll(async () => {
		autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });
		stripeCli = ctx.stripeCli;

		await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			attachPm: "success",
		});

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: products.proWithTrial.id,
		});

		const { testClockId: testClockId1, customer } = await initCustomerV3({
			ctx,
			customerId: redeemerId,
		});

		testClockId = testClockId1;
		redeemer = customer;
	});

	test("should create referral code", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.freeProduct.id,
		});

		expect(referralCode.code).toBeDefined();
	});

	test("should create redemption for each redeemer and fail if redeemed again", async () => {
		const redemption: RewardRedemption = await autumn.referrals.redeem({
			customerId: redeemerId,
			code: referralCode.code,
		});

		redemptions.push(redemption);
	});

	test("should not be triggered because of trial", async () => {
		await autumn.attach({
			customer_id: redeemerId,
			product_id: products.proWithTrial.id,
		});

		await timeout(3000);

		// Get redemption object
		const redemption = await autumn.redemptions.get(redemptions[0].id);

		expect(redemption.triggered).toBe(false);
	});

	test("should be triggered after trial ends", async () => {
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

		expect(redemption.triggered).toBe(true);

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
