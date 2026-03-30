import { expect, test } from "bun:test";
import { ErrCode, type RewardRedemption } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

/**
 * Referrals3: Free product referrals (checkout trigger, both parties)
 *
 * Setup:
 * - Main customer (no PM) attached to proWithTrial
 * - 3 redeemers with payment methods
 * - Reward: free add-on product
 * - Program: checkout trigger, both referrer + redeemer, max 2 redemptions
 *
 * Flow:
 * 1. Create referral code
 * 2. Redeemers redeem code, 1st can't redeem again
 * 3. Redeemers attach pro → triggers reward (first 2 within max_redemptions)
 *    Both referrer and redeemer should get the free add-on
 */

test(`${chalk.yellowBright("referrals3: free product referrals on checkout")}`, async () => {
	const mainCustomerId = "main-referral-3";
	const redeemers = ["referral3-r1", "referral3-r2", "referral3-r3"];

	// Products
	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});
	const pro = products.pro({
		id: "proNoTrial",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});
	const freeAddOn = products.base({
		id: "freeAddOn",
		isAddOn: true,
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	// Reward & referral program
	const reward = rewards.freeProduct({ freeProductId: freeAddOn.id });
	const program = referralPrograms.onCheckoutBoth({
		rewardId: reward.id,
		productIds: [proWithTrial.id, pro.id],
		maxRedemptions: 2,
	});

	// Setup
	const { autumnV1, referralCode } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({
				data: { fingerprint: "main-referral-3" },
			}),
			s.products({ list: [proWithTrial, pro, freeAddOn] }),
			s.referralProgram({ reward, program }),
			s.otherCustomers([
				{
					id: redeemers[0],
					paymentMethod: "success",
					distinctTestClock: true,
				},
				{
					id: redeemers[1],
					paymentMethod: "success",
					distinctTestClock: true,
				},
				{
					id: redeemers[2],
					paymentMethod: "success",
					distinctTestClock: true,
				},
			]),
		],
		actions: [
			s.attach({ productId: proWithTrial.id }),
			s.referral.createCode(),
		],
	});

	expect(referralCode!.code).toBeDefined();

	// 1. Redeemers redeem code, 1st can't redeem again
	const redemptions: RewardRedemption[] = [];
	for (const redeemer of redeemers) {
		const redemption = await autumnV1.referrals.redeem({
			customerId: redeemer,
			code: referralCode!.code,
		});
		redemptions.push(redemption);
	}

	try {
		await autumnV1.referrals.redeem({
			customerId: redeemers[0],
			code: referralCode!.code,
		});
		throw new Error("Should not be able to redeem again");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.CustomerAlreadyRedeemedReferralCode,
		);
	}

	// 2. Redeemers attach pro → triggers reward (first 2 within max_redemptions)
	for (let i = 0; i < redeemers.length; i++) {
		await autumnV1.attach({
			customer_id: redeemers[i],
			product_id: pro.id,
		});

		await timeout(15000);

		const redemption = await autumnV1.redemptions.get(redemptions[i].id);
		const count = i + 1;

		if (count > program.max_redemptions!) {
			expect(redemption.triggered).toBe(false);
			expect(redemption.applied).toBe(false);
		} else {
			// Both referrer and redeemer should have the free add-on
			const mainCustomer = await autumnV1.customers.get(mainCustomerId);
			const redeemerCustomer = await autumnV1.customers.get(redeemers[i]);

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
