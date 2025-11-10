import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	type CreateRewardProgram,
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
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "referrals1";

const proWithTrial = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const pro = constructProduct({
	id: "proNoTrial",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
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

// Referral program: triggers on checkout, applies to pro and proWithTrial
const onCheckoutProgram: CreateRewardProgram = {
	id: `${testCase}OnCheckout`,
	when: RewardTriggerEvent.Checkout,
	product_ids: [proWithTrial.id, pro.id],
	internal_reward_id: monthOffReward.id,
	max_redemptions: 2,
	received_by: RewardReceivedBy.Referrer,
};

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

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		await initProductsV0({
			ctx,
			products: [proWithTrial, pro],
			prefix: testCase,
			customerId: mainCustomerId,
		});

		// Create referral program - product IDs are already prefixed by initProductsV0
		const referralProgram: CreateRewardProgram = {
			...onCheckoutProgram,
			product_ids: [proWithTrial.id, pro.id],
		};

		await createReferralProgram({
			db,
			orgId: org.id,
			env,
			autumn: new AutumnInt({ secretKey: ctx.orgSecretKey }),
			reward: monthOffReward,
			rewardProgram: referralProgram,
		});

		const res = await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			customerData: { fingerprint: "main-referral-1" },
			attachPm: "success",
		});

		mainCustomer = res.customer;
		testClockId = res.testClockId;

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: proWithTrial.id,
		});

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

		batchCreate.push(
			initCustomerV3({
				ctx,
				customerId: alternateCustomerId,
				customerData: { fingerprint: "main-referral-1" },
				attachPm: "success",
			}),
		);
		await Promise.all(batchCreate);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: onCheckoutProgram.id,
		});

		expect(referralCode.code).toBeDefined();

		// Get referral code again
		const referralCode2 = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: onCheckoutProgram.id,
		});

		expect(referralCode2.code).toBe(referralCode.code);
	});

	test("should fail if same customer tries to redeem code again", async () => {
		try {
			await autumn.referrals.redeem({
				customerId: mainCustomerId,
				code: referralCode.code,
			});
			throw new Error("Own customer should not be able to redeem code");
		} catch (error) {
			expect(error).toBeInstanceOf(AutumnError);
			expect((error as AutumnError).code).toBe(
				ErrCode.CustomerCannotRedeemOwnCode,
			);
		}

		try {
			await autumn.referrals.redeem({
				customerId: alternateCustomerId,
				code: referralCode.code,
			});
			throw new Error(
				"Own customer (same fingerprint) should not be able to redeem code",
			);
		} catch (error) {
			expect(error).toBeInstanceOf(AutumnError);
			expect((error as AutumnError).code).toBe(
				ErrCode.CustomerCannotRedeemOwnCode,
			);
		}
	});

	test("should create redemption for each redeemer and fail if redeemed again", async () => {
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
			throw new Error("Should not be able to redeem again");
		} catch (error) {
			expect(error).toBeInstanceOf(AutumnError);
			expect((error as AutumnError).code).toBe(
				ErrCode.CustomerAlreadyRedeemedReferralCode,
			);
		}
	});

	test("should be triggered (and applied) when redeemers check out", async () => {
		for (let i = 0; i < redeemers.length; i++) {
			const redeemer = redeemers[i];

			await autumn.attach({
				customer_id: redeemer,
				product_id: pro.id,
			});

			await timeout(3000);

			// Get redemption object
			const redemption = await autumn.redemptions.get(redemptions[i].id);

			// Check if redemption is triggered
			const count = i + 1;

			if (count > onCheckoutProgram.max_redemptions!) {
				expect(redemption.triggered).toBe(false);
				expect(redemption.applied).toBe(false);
			} else {
				expect(redemption.triggered).toBe(true);
				expect(redemption.applied).toBe(i === 0);
			}

			// Check stripe customer
			const stripeCus = (await stripeCli.customers.retrieve(
				mainCustomer.processor?.id,
			)) as Stripe.Customer;

			expect(stripeCus.discount).not.toBe(null);
		}
	});

	let curTime = new Date();
	test("customer should have discount for first purchase", async () => {
		curTime = addDays(addDays(curTime, 7), 4);
		await advanceTestClock({
			testClockId,
			advanceTo: curTime.getTime(),
			stripeCli,
		});

		// 1. Get invoice
		const { invoices } = await autumn.customers.get(mainCustomerId);
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(0);
	});
});
