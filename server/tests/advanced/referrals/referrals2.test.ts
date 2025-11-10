import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	type CreateRewardProgram,
	type Customer,
	ErrCode,
	type Organization,
	type ReferralCode,
	RewardReceivedBy,
	type RewardRedemption,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import { createReferralProgram } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "referrals2";

const proWithTrial = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

// Reward: 100% discount for 1 month
const monthOffReward: CreateReward = {
	id: `${testCase}MonthOff`,
	name: "Month Off",
	type: RewardType.PercentageDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: 100,
		duration_type: CouponDurationType.Months,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
};

// Referral program: triggers immediately on customer creation
const immediateProgram: CreateRewardProgram = {
	id: `${testCase}Immediate`,
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [],
	internal_reward_id: monthOffReward.id,
	max_redemptions: 2,
	received_by: RewardReceivedBy.Referrer,
};

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

		await initProductsV0({
			ctx,
			products: [proWithTrial],
			prefix: testCase,
			customerId: mainCustomerId,
		});

		// Create referral program
		await createReferralProgram({
			db: ctx.db,
			orgId: org.id,
			env,
			autumn: new AutumnInt({ secretKey: ctx.orgSecretKey }),
			reward: monthOffReward,
			rewardProgram: immediateProgram,
		});

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
			referralId: immediateProgram.id,
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

				if (count > immediateProgram.max_redemptions!) {
					expect(redemption.triggered).toBe(false);
					expect(redemption.applied).toBe(false);
				} else {
					throw new Error("Should not be able to redeem again");
				}
			} catch (error) {
				if (count > immediateProgram.max_redemptions!) {
					expect(error).toBeInstanceOf(AutumnError);
					expect((error as AutumnError).code).toBe(
						ErrCode.ReferralCodeMaxRedemptionsReached,
					);
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
			product_id: proWithTrial.id,
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
