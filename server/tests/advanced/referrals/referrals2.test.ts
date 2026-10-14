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
import { createStripeCli } from "@/external/connect/createStripeCli.js";

test(`${chalk.yellowBright("referrals2: immediate referral redemption with percentage discount")}`, async () => {
	const mainCustomerId = "main-referral-2";
	const redeemers = ["referral2-r1", "referral2-r2", "referral2-r3"];

	const proWithTrial = products.proWithTrial({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});

	const reward = rewards.monthOff();
	const program = referralPrograms.onCustomerCreationReferrer({
		rewardId: reward.id,
		maxRedemptions: 2,
	});

	const { autumnV1, testClockId, referralCode, customer } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [proWithTrial] }),
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
		actions: [s.referral.createCode()],
	});

	expect(referralCode!.code).toBeDefined();

	const redemptions: RewardRedemption[] = [];
	for (let i = 0; i < redeemers.length; i++) {
		const count = i + 1;
		try {
			const redemption = await autumnV1.referrals.redeem({
				customerId: redeemers[i],
				code: referralCode!.code,
			});
			redemptions.push(redemption);

			if (count > program.max_redemptions!) {
				expect(redemption.triggered).toBe(false);
				expect(redemption.applied).toBe(false);
			}
		} catch (error) {
			if (count > program.max_redemptions!) {
				expect(error).toBeInstanceOf(AutumnError);
				expect((error as AutumnError).code).toBe(
					ErrCode.ReferralCodeMaxRedemptionsReached,
				);
			}
		}
	}

	const legacyStripe = createStripeCli({
		org: ctx.org,
		env: ctx.env,
		legacyVersion: true,
	});

	const stripeCus = (await legacyStripe.customers.retrieve(
		customer!.processor?.id,
		{ expand: ["discount"] },
	)) as Stripe.Customer;
	expect(stripeCus.discount).not.toBe(null);

	await autumnV1.attach({
		customer_id: mainCustomerId,
		product_id: proWithTrial.id,
	});

	await timeout(3000);

	const advanceTo = addDays(addDays(new Date(), 7), 4);
	await advanceTestClock({
		testClockId: testClockId!,
		advanceTo: advanceTo.getTime(),
		stripeCli: ctx.stripeCli,
		waitForSeconds: 30,
	});

	const { invoices } = await autumnV1.customers.get(mainCustomerId);
	expect(invoices!.length).toBe(2);
	expect(invoices![0].total).toBe(0);
});
