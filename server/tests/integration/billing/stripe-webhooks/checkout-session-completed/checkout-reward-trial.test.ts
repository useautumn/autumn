/** Red: trial checkout left referral reward unapplied; green: exclude_trial=false applies at trial start. */

import { expect, test } from "bun:test";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const waitForRedemptionApplied = async ({
	autumnV1,
	redemptionId,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	redemptionId: string;
}) => {
	for (let i = 0; i < 20; i++) {
		const redemption = await autumnV1.redemptions.get(redemptionId);
		if (redemption.triggered && redemption.applied) return redemption;
		await timeout(1000);
	}

	return autumnV1.redemptions.get(redemptionId);
};

test.concurrent(`${chalk.yellowBright("checkout-reward-trial: exclude_trial=false applies reward on trial checkout")}`, async () => {
	const referrerId = "checkout-reward-trial-referrer";
	const redeemerId = "checkout-reward-trial-redeemer";

	const proTrial = products.proWithTrial({
		id: "pro-trial-reward",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 7,
		cardRequired: true,
	});

	const reward = rewards.halfOff();
	const program = {
		...referralPrograms.onCheckoutReferrer({
			rewardId: reward.id,
			productIds: [proTrial.id],
			maxRedemptions: 1,
		}),
		exclude_trial: false,
	};

	const { autumnV1, redemption } = await initScenario({
		customerId: referrerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.otherCustomers([{ id: redeemerId }]),
			s.products({ list: [proTrial] }),
			s.referralProgram({ reward, program }),
		],
		actions: [
			s.attach({ productId: "pro-trial-reward" }),
			s.referral.createAndRedeem({ customerId: redeemerId }),
		],
	});

	const result = await autumnV1.billing.attach({
		customer_id: redeemerId,
		product_id: proTrial.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: result.payment_url! });

	const updatedRedemption = await waitForRedemptionApplied({
		autumnV1,
		redemptionId: redemption!.id,
	});
	expect(updatedRedemption.triggered).toBe(true);
	expect(updatedRedemption.applied).toBe(true);
});
