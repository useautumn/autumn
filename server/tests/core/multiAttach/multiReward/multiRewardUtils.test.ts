import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	LegacyVersion,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "tests/setup/v2Features.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

export const premiumTrial = constructProduct({
	id: "multiReward_premiumTrial",
	group: "multiReward",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
	trial: true,
});

export const proTrial = constructProduct({
	id: "multiReward_proTrial",
	group: "multiReward",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 300 }),
	],
	type: "pro",
	trial: true,
});
export const multiRewardPremium = constructProduct({
	id: "multiReward_premium",
	group: "multiReward",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 200 }),
	],
	type: "premium",
});

export const multiRewardPro = constructProduct({
	id: "multiReward_pro",
	group: "multiReward",
	items: [
		constructFeatureItem({ featureId: TestFeature.Words, includedUsage: 300 }),
	],
	type: "pro",
});

export const proReward: CreateReward = {
	id: "pro_reward",
	name: "pro_reward",
	promo_codes: [{ code: "pro_reward" }],
	type: RewardType.PercentageDiscount,
	discount_config: {
		discount_value: 50,
		duration_type: CouponDurationType.Months,
		duration_value: 3,
		should_rollover: true,
		apply_to_all: false,
		price_ids: [proTrial.id],
	},
};

export const premiumReward: CreateReward = {
	id: "premium_reward",
	name: "premium_reward",
	promo_codes: [{ code: "premium_reward" }],
	type: RewardType.PercentageDiscount,
	discount_config: {
		discount_value: 80,
		duration_type: CouponDurationType.Months,
		duration_value: 3,
		should_rollover: true,
		apply_to_all: false,
	},
};

export const setupMultiRewardBefore = async ({
	orgId,
	db,
	env,
}: {
	orgId: string;
	db: DrizzleCli;
	env: AppEnv;
}) => {
	const autumn = new AutumnInt({ version: LegacyVersion.v1_2 });
	for (const product of [
		proTrial,
		premiumTrial,
		multiRewardPro,
		multiRewardPremium,
	]) {
		// let res = await autumn.products.get(product.id);

		// if (res.code === "product_not_found") {
		//   try {
		//     await autumn.products.create(product);
		//   } catch (error) {}
		// }

		try {
			await autumn.products.delete(product.id);
		} catch (error) {
			// console.log("Error deleting product:", error);
		}

		try {
			await autumn.products.create(product);
		} catch (error) {}
	}

	const products = await ProductService.listFull({
		db,
		orgId,
		env,
	});

	const proTrialPrice = products.find((p) => p.id === proTrial.id)?.prices[0];
	const premiumTrialPrice = products.find((p) => p.id === premiumTrial.id)
		?.prices[0];
	const proProduct = products.find((p) => p.id === multiRewardPro.id);
	const premiumProduct = products.find((p) => p.id === multiRewardPremium.id);

	const proPriceIds = [proTrialPrice!.id, proProduct!.prices[0]!.id];
	const premiumPriceIds = [
		premiumTrialPrice!.id,
		premiumProduct!.prices[0]!.id,
	];

	for (const reward of [proReward, premiumReward]) {
		const rewardRes = null;
		// try {
		//   rewardRes = await autumn.rewards.get(reward.id);
		// } catch (error) {}

		try {
			await autumn.rewards.delete(reward.id);
		} catch (error) {}

		if (!rewardRes) {
			try {
				await autumn.rewards.create({
					...reward,
					discount_config: {
						...reward.discount_config,
						price_ids:
							reward.id == proReward.id ? proPriceIds : premiumPriceIds,
					},
				});
			} catch (error) {}
		}
	}
};
