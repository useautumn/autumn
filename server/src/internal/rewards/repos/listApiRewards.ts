import {
	type ApiCouponV0,
	type ApiFeatureGrantV0,
	type AppEnv,
	type Feature,
	type Reward,
	RewardType,
	rewards,
} from "@autumn/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { getApiCoupon } from "../apiRewards/getApiCoupon.js";
import { getApiFeatureGrant } from "../apiRewards/getApiFeatureGrant.js";

const COUPON_TYPES = new Set<RewardType>([
	RewardType.PercentageDiscount,
	RewardType.FixedDiscount,
	RewardType.InvoiceCredits,
]);

/** rewards.list row cap; base rewardRepo.list stays unbounded for other consumers. */
const MAX_API_REWARDS = 500;

/** Fetches an org's rewards (capped) and maps them to the V0 list shape: discount types → coupons, feature_grant → grants (free_product dropped). */
export const listApiRewards = async ({
	db,
	orgId,
	env,
	features,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	features: Feature[];
}): Promise<{
	coupons: ApiCouponV0[];
	feature_grants: ApiFeatureGrantV0[];
}> => {
	const rows = (await db.query.rewards.findMany({
		where: and(eq(rewards.org_id, orgId), eq(rewards.env, env)),
		with: { entitlements: true },
		orderBy: [desc(rewards.internal_id)],
		limit: MAX_API_REWARDS,
	})) as Reward[];

	const couponRewards = rows.filter((reward) => COUPON_TYPES.has(reward.type));
	const featureGrantRewards = rows.filter(
		(reward) => reward.type === RewardType.FeatureGrant,
	);

	const priceIds = [
		...new Set(
			couponRewards
				.filter((reward) => !reward.discount_config?.apply_to_all)
				.flatMap((reward) => reward.discount_config?.price_ids ?? []),
		),
	];

	const internalProductIdByPriceId = new Map<string, string>();
	const planIdByInternalProductId = new Map<string, string>();
	if (priceIds.length > 0) {
		const prices = await PriceService.getInIds({ db, ids: priceIds });
		for (const price of prices) {
			if (!price.internal_product_id) {
				continue;
			}
			internalProductIdByPriceId.set(price.id, price.internal_product_id);
			if (price.product?.id) {
				planIdByInternalProductId.set(
					price.internal_product_id,
					price.product.id,
				);
			}
		}
	}

	const coupons = couponRewards.map((reward) =>
		getApiCoupon({
			reward,
			planIdByInternalProductId,
			internalProductIdByPriceId,
		}),
	);
	const feature_grants = featureGrantRewards.map((reward) =>
		getApiFeatureGrant({ reward, features }),
	);

	return { coupons, feature_grants };
};
