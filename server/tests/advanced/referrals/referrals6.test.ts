import { expect, test } from "bun:test";
import { type CreateReward, findFeatureById } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { referralPrograms } from "@tests/utils/fixtures/referralPrograms";
import { rewards } from "@tests/utils/fixtures/rewards";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import AutumnError, { type AutumnInt } from "@/external/autumn/autumnCli.js";

/**
 * Referrals6: Referral programs must be linked to feature grant rewards
 *
 * Free product and discount rewards remain in the DB for existing programs,
 * but can no longer be linked to a new program through the API.
 */

const recreateReward = async ({
	autumnV1,
	reward,
}: {
	autumnV1: AutumnInt;
	reward: CreateReward;
}) => {
	try {
		await autumnV1.rewards.delete(reward.id);
	} catch {}

	await autumnV1.rewards.create(reward);
};

test(`${chalk.yellowBright("referrals6: reward program creation rejects non-feature-grant rewards")}`, async () => {
	const mainCustomerId = "main-referral-6";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyWords({ includedUsage: 0 })],
	});
	const freeAddOn = products.base({
		id: "freeAddOn6",
		isAddOn: true,
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});

	const messagesFeature = findFeatureById({
		features: ctx.features,
		featureId: items.lifetimeMessages({ includedUsage: 0 }).feature_id!,
	});

	const featureGrantReward = rewards.featureGrant({
		id: "referral6-grant",
		internalFeatureId: messagesFeature!.internal_id!,
		allowance: 50,
		promoCode: "REFERRAL6GRANT",
	});

	const { autumnV1 } = await initScenario({
		customerId: mainCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, freeAddOn] }),
			s.referralProgram({
				reward: featureGrantReward,
				program: referralPrograms.onCustomerCreationBoth({
					id: "referral6-valid",
					rewardId: featureGrantReward.id,
				}),
			}),
		],
		actions: [],
	});

	// Free product rewards are rejected
	const freeProductReward = rewards.freeProduct({
		id: "referral6-free-product",
		freeProductId: freeAddOn.id,
	});
	await recreateReward({ autumnV1, reward: freeProductReward });

	await expect(
		autumnV1.rewardPrograms.create(
			referralPrograms.onCustomerCreationBoth({
				id: "referral6-free-product-program",
				rewardId: freeProductReward.id,
			}),
		),
	).rejects.toThrow(AutumnError);

	// Discount rewards are still supported
	const discountReward = rewards.monthOff({ id: "referral6-discount" });
	await recreateReward({ autumnV1, reward: discountReward });

	const discountProgram = await autumnV1.rewardPrograms.create(
		referralPrograms.onCustomerCreationBoth({
			id: `referral6-discount-${Date.now()}`,
			rewardId: discountReward.id,
		}),
	);

	expect(discountProgram).toBeDefined();
});
