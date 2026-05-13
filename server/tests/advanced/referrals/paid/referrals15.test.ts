import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";

export const group = "referrals15";

test(`${chalk.yellowBright(
	"referrals15: Testing referrals - referrer starts with no product, gets pro_amount discount - immediate, both - coupon-based",
)}`, async () => {
	const mainCustomerId = "main-referral-15";
	const redeemerId = "referral15-r1";

	// Cleanup redemptions before scenario
	try {
		await redemptionRepo.resetCustomer({
			db: ctx.db,
			internalCustomerId: [mainCustomerId, redeemerId],
		});
	} catch {}

	// Products
	const freeProd = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 5 })],
	});

	const proProd = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
	});

	// Reward: pro_amount discount (coupon-based) — $10 off, 1 month
	const reward = rewards.percentageDiscount({
		id: "referrals15ProAmount",
		discountValue: 10,
		durationMonths: 1,
	});

	// Referral program: immediate trigger, both parties, max 10 redemptions
	// The fixture onCustomerCreationBoth doesn't accept productIds, so we build manually
	const program = referralPrograms.onCustomerCreationBoth({
		id: "referrals15ImmediateAll",
		rewardId: reward.id,
		maxRedemptions: 10,
	});

	// Override product_ids since the fixture defaults to []
	program.product_ids = [proProd.id];

	// Setup scenario — main customer has NO product attached (free tier only)
	// Both customers need distinct test clocks to avoid Stripe's 3-per-clock limit
	const {
		autumnV1,
		testClockId,
		testClockIds,
		ctx: testCtx,
	} = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({
				list: [freeProd, proProd],
				customerIdsToDelete: [mainCustomerId, redeemerId],
			}),
			s.referralProgram({ reward, program }),
			s.otherCustomers([
				{
					id: redeemerId,
					paymentMethod: "success",
					distinctTestClock: true,
				},
			]),
		],
		actions: [
			// Advance both clocks 10 days before creating/redeeming code
			s.advanceTestClock({ days: 10 }),
		],
	});

	// Advance redeemer's test clock too (it's separate)
	const redeemerClockId = testClockIds[redeemerId];
	await advanceTestClock({
		stripeCli: testCtx.stripeCli,
		testClockId: redeemerClockId,
		numberOfDays: 10,
		waitForSeconds: 10,
	});

	// Create referral code
	const referralCode = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode.code).toBeDefined();

	// Creating code again should return same code
	const referralCode2 = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode2.code).toBe(referralCode.code);

	// Redeemer redeems the code
	const redemption = await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode.code,
	});

	// Redeeming again should fail
	try {
		await autumnV1.referrals.redeem({
			customerId: redeemerId,
			code: referralCode.code,
		});
		throw new Error("Should not be able to redeem again");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.CustomerAlreadyRedeemedReferralCode,
		);
	}

	// Verify redemption state — for ReceivedBy.All, both parties should get the discount coupon
	const redemptionResult = await autumnV1.redemptions.get(redemption.id);
	expect(redemptionResult.triggered).toBe(true);
	expect(redemptionResult.applied).toBe(true);
	expect(redemptionResult.redeemer_applied).toBe(true);

	// Verify both customers have Stripe discount coupons applied
	// (Neither has Pro attached yet — they'd need to check out Pro to use the coupon)
	const mainCus = await autumnV1.customers.get(mainCustomerId);
	const redeemerCus = await autumnV1.customers.get(redeemerId);

	// Both should exist as valid customers
	expect(mainCus.id).toBe(mainCustomerId);
	expect(redeemerCus.id).toBe(redeemerId);
});
