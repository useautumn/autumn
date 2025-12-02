import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CreateReward,
	type CreateRewardProgram,
	ErrCode,
	type ReferralCode,
	RewardReceivedBy,
	type RewardRedemption,
	RewardTriggerEvent,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import { createReferralProgram } from "@tests/utils/productUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

const testCase = "referrals3";

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

// Referral program: triggers on checkout, applies to pro and proWithTrial
const freeProductProgram: CreateRewardProgram = {
	id: `${testCase}FreeProduct`,
	when: RewardTriggerEvent.Checkout,
	product_ids: [proWithTrial.id, pro.id],
	internal_reward_id: freeProductReward.id,
	max_redemptions: 2,
	received_by: RewardReceivedBy.All,
};

describe(`${chalk.yellowBright(
	"referrals3: Testing free product referrals",
)}`, () => {
	const mainCustomerId = "main-referral-3";
	const redeemers = ["referral3-r1", "referral3-r2", "referral3-r3"];
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let referralCode: ReferralCode;
	const redemptions: RewardRedemption[] = [];

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [proWithTrial, pro, freeAddOn],
			prefix: testCase,
			customerId: mainCustomerId,
		});

		// Create referral program - product IDs are already prefixed by initProductsV0
		const referralProgram: CreateRewardProgram = {
			...freeProductProgram,
			product_ids: [proWithTrial.id, pro.id],
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
			customerData: { fingerprint: "main-referral-3" },
		});

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

		await Promise.all(batchCreate);
	});

	test("should create code once", async () => {
		referralCode = await autumn.referrals.createCode({
			customerId: mainCustomerId,
			referralId: freeProductProgram.id,
		});

		expect(referralCode.code).toBeDefined();
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

			if (count > freeProductProgram.max_redemptions!) {
				expect(redemption.triggered).toBe(false);
				expect(redemption.applied).toBe(false);
			} else {
				const mainCustomer = await autumn.customers.get(mainCustomerId);

				const redeemerCustomer = await autumn.customers.get(redeemer);

				expectProductAttached({
					customer: mainCustomer,
					product: freeAddOn,
				});

				expectProductAttached({
					customer: redeemerCustomer,
					product: freeAddOn,
				});
			}
		}
	});
});
