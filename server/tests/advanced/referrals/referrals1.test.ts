import { expect, test } from "bun:test";
import { ErrCode, type RewardRedemption } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type { Stripe } from "stripe";
import AutumnError from "@/external/autumn/autumnCli.js";

test(`${chalk.yellowBright("referrals1: checkout-triggered referrals with percentage discount")}`, async () => {
	const mainCustomerId = "main-referral-1";
	const alternateCustomerId = "alternate-referral-1";
	const redeemers = ["referral1-r1", "referral1-r2", "referral1-r3"];

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});
	const pro = products.pro({
		id: "proNoTrial",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});

	const reward = rewards.monthOff();
	const program = referralPrograms.onCheckoutReferrer({
		rewardId: reward.id,
		productIds: [proWithTrial.id, pro.id],
		maxRedemptions: 2,
	});

	const { autumnV1, testClockId, referralCode, customer } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({
				paymentMethod: "success",
				testClock: true,
				data: { fingerprint: mainCustomerId },
			}),
			s.products({ list: [proWithTrial, pro] }),
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
				{
					id: alternateCustomerId,
					paymentMethod: "success",
					data: { fingerprint: mainCustomerId },
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

	const referralCode2 = await autumnV1.referrals.createCode({
		customerId: mainCustomerId,
		referralId: program.id,
	});
	expect(referralCode2.code).toBe(referralCode!.code);

	try {
		await autumnV1.referrals.redeem({
			customerId: mainCustomerId,
			code: referralCode!.code,
		});
		throw new Error("Own customer should not be able to redeem code");
	} catch (error) {
		expect(error).toBeInstanceOf(AutumnError);
		expect((error as AutumnError).code).toBe(
			ErrCode.CustomerCannotRedeemOwnCode,
		);
	}

	try {
		await autumnV1.referrals.redeem({
			customerId: alternateCustomerId,
			code: referralCode!.code,
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

	for (let i = 0; i < redeemers.length; i++) {
		await autumnV1.attach({
			customer_id: redeemers[i],
			product_id: pro.id,
		});

		await timeout(10000);

		const redemption = await autumnV1.redemptions.get(redemptions[i].id);
		const count = i + 1;

		if (count > program.max_redemptions!) {
			expect(redemption.triggered).toBe(false);
			expect(redemption.applied).toBe(false);
		} else {
			expect(redemption.triggered).toBe(true);
			expect(redemption.applied).toBe(i === 0);
		}

		const stripeCus = (await ctx.stripeCli.customers.retrieve(
			customer!.processor?.id,
		)) as Stripe.Customer;
		expect(stripeCus.discount).not.toBe(null);
	}

	const advanceTo = addDays(addDays(new Date(), 7), 4);
	await advanceTestClock({
		testClockId: testClockId!,
		advanceTo: advanceTo.getTime(),
		stripeCli: ctx.stripeCli,
	});

	const { invoices } = await autumnV1.customers.get(mainCustomerId);
	expect(invoices.length).toBe(2);
	expect(invoices[0].total).toBe(0);
});
