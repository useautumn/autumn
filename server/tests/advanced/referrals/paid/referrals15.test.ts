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

	try {
		await redemptionRepo.resetCustomer({
			db: ctx.db,
			internalCustomerId: [mainCustomerId, redeemerId],
		});
	} catch {}

	const freeProd = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 5 })],
	});

	const proProd = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 10 })],
	});

	const reward = rewards.percentageDiscount({
		id: "referrals15ProAmount",
		discountValue: 10,
		durationMonths: 1,
	});

	const program = referralPrograms.onCustomerCreationBoth({
		id: "referrals15ImmediateAll",
		rewardId: reward.id,
		maxRedemptions: 10,
	});

	program.product_ids = [proProd.id];

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
		actions: [s.advanceTestClock({ days: 10 })],
	});

	const redeemerClockId = testClockIds[redeemerId];
	await advanceTestClock({
		stripeCli: testCtx.stripeCli,
		testClockId: redeemerClockId,
		numberOfDays: 10,
		waitForSeconds: 10,
	});

	const referralCode = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode.code).toBeDefined();

	const referralCode2 = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode2.code).toBe(referralCode.code);

	const redemption = await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode.code,
	});

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

	const redemptionResult = await autumnV1.redemptions.get(redemption.id);
	expect(redemptionResult.triggered).toBe(true);
	expect(redemptionResult.applied).toBe(true);
	expect(redemptionResult.redeemer_applied).toBe(true);

	const mainCus = await autumnV1.customers.get(mainCustomerId);
	const redeemerCus = await autumnV1.customers.get(redeemerId);

	expect(mainCus.id).toBe(mainCustomerId);
	expect(redeemerCus.id).toBe(redeemerId);
});
