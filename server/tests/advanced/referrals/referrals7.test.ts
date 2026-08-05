import { expect, test } from "bun:test";
import { findFeatureById, type RewardRedemption } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Referrals7: Checkout-triggered feature grant referrals
 *
 * Flow:
 * 1. Redeemer redeems code — reward not granted yet (checkout trigger)
 * 2. Redeemer attaches a paid plan → reward triggered, referrer receives the balance
 */

test(`${chalk.yellowBright("referrals7: checkout feature grant referral grants on attach")}`, async () => {
	const mainCustomerId = "main-referral-7";
	const redeemerId = "referral7-r1";
	const grantedAllowance = 250;

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});

	const messagesFeature = findFeatureById({
		features: ctx.features,
		featureId: items.lifetimeMessages({ includedUsage: 0 }).feature_id!,
	});

	const reward = rewards.featureGrant({
		id: "referral7-grant",
		internalFeatureId: messagesFeature!.internal_id!,
		allowance: grantedAllowance,
		promoCode: "REFERRAL7GRANT",
	});

	const program = referralPrograms.onCheckoutReferrer({
		id: "referral7-program",
		rewardId: reward.id,
		productIds: [pro.id],
		maxRedemptions: 2,
	});

	const { autumnV1, referralCode } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.referralProgram({ reward, program }),
			s.otherCustomers([
				{ id: redeemerId, paymentMethod: "success", distinctTestClock: true },
			]),
		],
		actions: [s.referral.createCode()],
	});

	const redemption: RewardRedemption = await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode!.code,
	});

	// Checkout trigger — nothing granted until the redeemer buys
	const redemptionBeforeCheckout = await autumnV1.redemptions.get(
		redemption.id,
	);
	expect(redemptionBeforeCheckout.triggered).toBe(false);

	const beforeCheckout = await autumnV1.check({
		customer_id: mainCustomerId,
		feature_id: messagesFeature!.id,
	});
	expect(beforeCheckout.balance ?? 0).toBe(0);

	await autumnV1.attach({
		customer_id: redeemerId,
		product_id: pro.id,
	});

	await timeout(15000);

	const redemptionAfterCheckout = await autumnV1.redemptions.get(redemption.id);
	expect(redemptionAfterCheckout.triggered).toBe(true);

	// Referrer only — redeemer should not receive the grant
	const referrerCheck = await autumnV1.check({
		customer_id: mainCustomerId,
		feature_id: messagesFeature!.id,
	});
	expect(referrerCheck.balance).toBe(grantedAllowance);

	const redeemerCheck = await autumnV1.check({
		customer_id: redeemerId,
		feature_id: messagesFeature!.id,
	});
	expect(redeemerCheck.balance ?? 0).toBe(0);
});
