import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CreateReward,
	type CreateRewardProgram,
	type ReferralCode,
	RewardReceivedBy,
	type RewardRedemption,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import type { Stripe } from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { timeout } from "tests/utils/genUtils.js";
import { createReferralProgram } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

const testCase = "referrals4";

const proWithTrial = constructProduct({
	id: "pro",
	items: [constructFeatureItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const freeAddOn = constructProduct({
	id: "freeAddOn",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: null,
		}),
	],
	type: "free",
	isAddOn: true,
	isDefault: false,
});

// Reward: Free product reward
const freeProductReward: CreateReward = {
	id: `${testCase}FreeProduct`,
	name: "Free Product",
	type: RewardType.FreeProduct,
	promo_codes: [],
	free_product_id: freeAddOn.id,
};

// Referral program: triggers on checkout
const freeProductProgram: CreateRewardProgram = {
	id: `${testCase}FreeProduct`,
	when: RewardTriggerEvent.Checkout,
	product_ids: [proWithTrial.id],
	internal_reward_id: freeProductReward.id,
	max_redemptions: 2,
	received_by: RewardReceivedBy.All,
};

describe(`${chalk.yellowBright(
	"referrals4: Testing free product referrals with trial",
)}`, () => {
	const mainCustomerId = "main-referral-4";
	const redeemerId = "referral4-r1";

	let autumn: AutumnInt = new AutumnInt();
	let stripeCli: Stripe;
	let referralCode: ReferralCode;

	const redemptions: RewardRedemption[] = [];

	let testClockId: string;

	beforeAll(async () => {
		autumn = new AutumnInt({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V1_2,
		});
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [proWithTrial, freeAddOn],
			prefix: testCase,
			customerId: mainCustomerId,
		});

		// Create referral program - product IDs are already prefixed by initProductsV0
		const referralProgram: CreateRewardProgram = {
			...freeProductProgram,
			product_ids: [proWithTrial.id],
		};

		// Update reward with prefixed free product ID
		const reward: CreateReward = {
			...freeProductReward,
			free_product_id: freeAddOn.id,
		};

		await createReferralProgram({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn,
			reward,
			rewardProgram: referralProgram,
		});

		await initCustomerV3({
			ctx,
			customerId: mainCustomerId,
			attachPm: "success",
		});

		await autumn.attach({
			customer_id: mainCustomerId,
			product_id: proWithTrial.id,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId: redeemerId,
			attachPm: "success",
		});

		testClockId = testClockId1;
	});

	test("should create referral code", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: freeProductProgram.id,
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
			product_id: proWithTrial.id,
		});

		await timeout(3000);

		// Get redemption object
		const redemption = await autumn.redemptions.get(redemptions[0].id);

		expect(redemption.triggered).toBe(false);
	});

	test("should be triggered after trial ends", async () => {
		await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addDays(new Date(), 7),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const redemption = await autumn.redemptions.get(redemptions[0].id);
		expect(redemption.triggered).toBe(true);

		const mainCustomer = await autumn.customers.get(mainCustomerId);
		const redeemer = await autumn.customers.get(redeemerId);

		expectProductAttached({
			customer: mainCustomer,
			product: freeAddOn,
		});

		expectProductAttached({
			customer: redeemer,
			product: freeAddOn,
		});
	});
});
