import {
	type AppEnv,
	type Customer,
	ErrCode,
	type Organization,
	type ReferralCode,
	type RewardRedemption,
} from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { timeout } from "tests/utils/genUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { products, referralPrograms } from "../../global.js";

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

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		org = ctx.org;
		env = ctx.env;

		const { testClockId: testClockId1, customer } = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
		});
		testClockId = testClockId1;
		mainCustomer = customer;

		const batchCreate = [];
		for (const redeemer of redeemers) {
			batchCreate.push(
				initCustomerV3({
					ctx,
					customerId: redeemer,
					attachPm: "success",
				}),
			);
		}

		await Promise.all(batchCreate);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: referralPrograms.immediate.id,
		});

		expect(referralCode.code).toBeDefined();
	});

	test("should create redemption for each redeemer and fail if redeemed again", async () => {
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
					expect(redemption.triggered).toBe(false);
					expect(redemption.applied).toBe(false);
				} else {
					throw new Error("Should not be able to redeem again");
				}
			} catch (error) {
				if (count > referralPrograms.immediate.max_redemptions) {
					expect(error).toBeInstanceOf(AutumnError);
					expect((error as AutumnError).code).toBe(ErrCode.ReferralCodeMaxRedemptionsReached);
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

		expect(stripeCus.discount).not.toBe(null);
	});

	let curTime = new Date();
	test("customer should have discount for first purchase", async () => {
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

		expect(invoices!.length).toBe(2);
		expect(invoices![0].total).toBe(0);
	});
});
