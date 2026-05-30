/**
 * Regression coverage for the micro-org sandbox config: when=checkout,
 * exclude_trial=false, received_by=all, reward = FREE PRODUCT (credits bonus add-on).
 *
 * The existing checkout-reward-trial.test.ts only covers a DISCOUNT reward +
 * received_by=referrer; this pins the free-product + received_by=all variant.
 *
 * Behavior: after the redeemer completes Stripe checkout for a trial product, the
 * referral reward must be granted even while the redeemer is trialing (because
 * exclude_trial=false) — redemption.triggered && redemption.applied, and BOTH the
 * redeemer and the referrer must hold the bonus product. (Verified green on main:
 * the reported failure occurred under exclude_trial=true, which correctly defers.)
 */

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
	for (let i = 0; i < 25; i++) {
		const redemption = await autumnV1.redemptions.get(redemptionId);
		if (redemption.triggered && redemption.applied) return redemption;
		await timeout(1000);
	}

	return autumnV1.redemptions.get(redemptionId);
};

const customerHasProduct = async ({
	autumnV1,
	customerId,
	productId,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	productId: string;
}) => {
	const customer = await autumnV1.customers.get(customerId);
	return (customer.products ?? []).some((p: { id: string }) => p.id === productId);
};

test.concurrent(
	`${chalk.yellowBright("checkout-reward-trial-free-product: free-product reward (received_by=all) applies on trial checkout when exclude_trial=false")}`,
	async () => {
		const referrerId = "checkout-reward-trial-fp-referrer";
		const redeemerId = "checkout-reward-trial-fp-redeemer";

		const proTrial = products.proWithTrial({
			id: "pro-trial-fp-reward",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
			cardRequired: true,
		});

		// Free add-on (no price) granting credits — mirrors `1k_credits_referral_bonus`.
		const bonus = products.base({
			id: "credits-bonus-reward",
			isAddOn: true,
			items: [items.lifetimeMessages({ includedUsage: 1000 })],
		});

		const reward = rewards.freeProduct({
			id: "free-product-reward",
			freeProductId: bonus.id,
		});
		const program = {
			...referralPrograms.onCheckoutBoth({
				rewardId: reward.id,
				productIds: [proTrial.id],
				maxRedemptions: 100,
			}),
			exclude_trial: false,
		};

		const { autumnV1, redemption } = await initScenario({
			customerId: referrerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.otherCustomers([{ id: redeemerId }]),
				s.products({ list: [proTrial, bonus] }),
				s.referralProgram({ reward, program }),
			],
			actions: [
				s.attach({ productId: "pro-trial-fp-reward" }),
				s.referral.createAndRedeem({ customerId: redeemerId }),
			],
		});

		// Redeemer checks out the trial product (no PM → Stripe checkout URL).
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

		// Primary symptom the customer reported: reward_applied stayed false.
		expect(updatedRedemption.triggered).toBe(true);
		expect(updatedRedemption.applied).toBe(true);

		// received_by=all → both parties must actually receive the bonus product.
		// `bonus.id` is mutated to the prefixed id by initScenario.
		const redeemerGotBonus = await customerHasProduct({
			autumnV1,
			customerId: redeemerId,
			productId: bonus.id,
		});
		const referrerGotBonus = await customerHasProduct({
			autumnV1,
			customerId: referrerId,
			productId: bonus.id,
		});

		expect(redeemerGotBonus).toBe(true);
		expect(referrerGotBonus).toBe(true);
	},
);
