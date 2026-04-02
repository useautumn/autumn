import { expect, test } from "bun:test";
import type { RewardRedemption } from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addHours } from "date-fns";
import { expectProductAttached } from "../../utils/expectUtils/expectProductAttached.js";

/**
 * Referrals4: Free product referrals with trial — reward delayed until trial ends
 *
 * Setup:
 * - Main customer attached to proWithTrial (no PM needed)
 * - 1 redeemer with PM, on own test clock
 * - Reward: free add-on product
 * - Program: checkout trigger, both parties, max 2 redemptions
 *
 * Flow:
 * 1. Create referral code, redeemer redeems
 * 2. Redeemer attaches proWithTrial (has trial) → reward NOT triggered yet
 * 3. Advance redeemer's test clock past trial → reward triggered, both get free add-on
 */

test(`${chalk.yellowBright("referrals4: free product referrals delayed by trial")}`, async () => {
	const mainCustomerId = "main-referral-4";
	const redeemerId = "referral4-r1";

	// Products
	const proWithTrial = products.proWithTrial({
		id: "pro",
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
		productIds: [proWithTrial.id],
		maxRedemptions: 2,
	});

	// Setup — redeemer gets its own test clock (we need to advance it independently)
	const { autumnV1, referralCode, testClockIds } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proWithTrial, freeAddOn] }),
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
			s.attach({ productId: proWithTrial.id }),
			s.referral.createCode(),
		],
	});

	expect(referralCode!.code).toBeDefined();

	// 1. Redeemer redeems code
	const redemption: RewardRedemption = await autumnV1.referrals.redeem({
		customerId: redeemerId,
		code: referralCode!.code,
	});

	// 2. Redeemer attaches proWithTrial → reward NOT triggered (trial)
	await autumnV1.attach({
		customer_id: redeemerId,
		product_id: proWithTrial.id,
	});

	await timeout(10000);

	const redemptionAfterAttach = await autumnV1.redemptions.get(redemption.id);
	expect(redemptionAfterAttach.triggered).toBe(false);

	// 3. Advance redeemer's test clock past trial → reward triggered
	const redeemerClockId = testClockIds[redeemerId];
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: redeemerClockId,
		advanceTo: addHours(
			addDays(new Date(), 7),
			hoursToFinalizeInvoice,
		).getTime(),
		waitForSeconds: 30,
	});

	const redemptionAfterTrial = await autumnV1.redemptions.get(redemption.id);
	expect(redemptionAfterTrial.triggered).toBe(true);

	// Both referrer and redeemer should have the free add-on
	const mainCustomer = await autumnV1.customers.get(mainCustomerId);
	const redeemer = await autumnV1.customers.get(redeemerId);

	expectProductAttached({
		customer: mainCustomer,
		product: freeAddOn,
	});

	expectProductAttached({
		customer: redeemer,
		product: freeAddOn,
	});
});
