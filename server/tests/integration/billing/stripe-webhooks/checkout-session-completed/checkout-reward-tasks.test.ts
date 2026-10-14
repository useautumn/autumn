import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

test.concurrent(`${chalk.yellowBright("checkout-reward-tasks: v2 attach triggers referral reward for referrer")}`, async () => {
	const referrerId = "checkout-reward-referrer";
	const redeemerId = "checkout-reward-redeemer";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const reward = rewards.halfOff();
	const program = referralPrograms.onCheckoutReferrer({
		rewardId: reward.id,
		productIds: [pro.id],
		maxRedemptions: 1,
	});

	const { autumnV1, redemption, customer } = await initScenario({
		customerId: referrerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.otherCustomers([{ id: redeemerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
			s.referralProgram({ reward, program }),
		],
		actions: [
			s.attach({ productId: "pro" }),
			s.referral.createAndRedeem({ customerId: redeemerId }),
			s.attach({ productId: "pro", customerId: redeemerId }),
		],
	});

	await timeout(10000);

	const redeemerCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(redeemerId);
	await expectProductActive({
		customer: redeemerCustomer,
		productId: pro.id,
	});

	const updatedRedemption = await autumnV1.redemptions.get(redemption!.id);
	expect(updatedRedemption.triggered).toBe(true);
	expect(updatedRedemption.applied).toBe(true);

	const stripeProcessorId = customer?.processor?.id;
	if (stripeProcessorId) {
		const stripeCus = (await ctx.stripeCli.customers.retrieve(
			stripeProcessorId,
		)) as Stripe.Customer;
		expect(stripeCus.discount).not.toBe(null);
	}
});
