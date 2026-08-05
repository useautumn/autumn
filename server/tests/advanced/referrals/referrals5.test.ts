import { expect, test } from "bun:test";
import { findFeatureById } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Referrals5: Feature grant referrals — balances granted to both parties on redemption
 *
 * Flow:
 * 1. Create referral code, redeemer redeems
 * 2. Both referrer and redeemer receive the granted feature balance immediately
 */

test(`${chalk.yellowBright("referrals5: feature grant referral grants balance to both parties")}`, async () => {
	const mainCustomerId = "main-referral-5";
	const redeemerId = "referral5-r1";
	const grantedAllowance = 100;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});

	const messagesFeature = findFeatureById({
		features: ctx.features,
		featureId: items.lifetimeMessages({ includedUsage: 0 }).feature_id!,
	});

	const reward = rewards.featureGrant({
		internalFeatureId: messagesFeature!.internal_id!,
		allowance: grantedAllowance,
		promoCode: "REFERRAL5GRANT",
	});

	const program = referralPrograms.onCustomerCreationBoth({
		id: "referral5-program",
		rewardId: reward.id,
		maxRedemptions: 2,
	});

	const { autumnV1, referralCode } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.referralProgram({ reward, program }),
			s.otherCustomers([{ id: redeemerId, paymentMethod: "success" }]),
		],
		actions: [s.referral.createCode()],
	});

	expect(referralCode!.code).toBeDefined();

	await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode!.code,
	});

	for (const customerId of [mainCustomerId, redeemerId]) {
		const { balance } = await autumnV1.check({
			customer_id: customerId,
			feature_id: messagesFeature!.id,
		});

		expect(balance).toBe(grantedAllowance);
	}
});
