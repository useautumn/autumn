import {
	ErrCode,
	type Feature,
	FeatureType,
	findFeatureById,
	normalizePromoCodes,
	type Price,
	type Product,
	RecaseError,
	type Reward,
	RewardType,
	type UpdateRewardParams,
	type UpdateRewardResponse,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import {
	createStripeCoupon,
	resolveCouponStripeProductIds,
} from "@/external/stripe/stripeCouponUtils/stripeCouponUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { rewardRepo } from "../repos/index.js";
import { requireApiReward, toApiRewardResponse } from "./apiRewards.js";
import { getRewardPrices } from "./getRewardPrices.js";
import { validateRewardUniqueness } from "./validateRewardUniqueness.js";

type CouponUpdate = NonNullable<UpdateRewardParams["coupon"]>;
type FeatureGrantUpdate = NonNullable<UpdateRewardParams["feature_grant"]>;

/** Loosely typed: entitlements here use the reward-entitlement shape, not full Entitlement rows */
type RewardUpdate = Record<string, unknown>;

const buildCouponUpdate = async ({
	ctx,
	reward,
	coupon,
}: {
	ctx: AutumnContext;
	reward: Reward;
	coupon: CouponUpdate;
}): Promise<RewardUpdate> => {
	const update: RewardUpdate = {};

	if (coupon.name !== undefined) update.name = coupon.name;

	if (coupon.promo_codes !== undefined) {
		update.promo_codes = normalizePromoCodes(
			coupon.promo_codes.map(
				({ code, global_max_redemption, first_time_transaction }) => ({
					code,
					global_max_redemption: global_max_redemption ?? undefined,
					first_time_transaction: first_time_transaction ?? undefined,
				}),
			),
		);
	}

	if (coupon.plan_ids !== undefined) {
		const { db, org, env } = ctx;
		if (coupon.plan_ids === null) {
			update.discount_config = {
				...reward.discount_config!,
				apply_to_all: true,
				price_ids: [],
			};
		} else {
			const priceIds = await planIdsToPriceIds({
				db,
				orgId: org.id,
				env,
				planIds: coupon.plan_ids,
			});

			update.discount_config = {
				...reward.discount_config!,
				apply_to_all: false,
				price_ids: priceIds,
			};
		}
	}

	return update;
};

const planIdsToPriceIds = async ({
	db,
	orgId,
	env,
	planIds,
}: {
	db: AutumnContext["db"];
	orgId: string;
	env: AutumnContext["env"];
	planIds: string[];
}) => {
	const priceIds: string[] = [];
	for (const planId of planIds) {
		const fullProduct = await ProductService.getFull({
			db,
			idOrInternalId: planId,
			orgId,
			env,
		});

		if (!fullProduct) {
			throw new RecaseError({
				message: `Plan ${planId} not found`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		priceIds.push(...fullProduct.prices.map((price) => price.id));
	}

	return priceIds;
};

const buildFeatureGrantUpdate = ({
	features,
	featureGrant,
}: {
	features: Feature[];
	featureGrant: FeatureGrantUpdate;
}): RewardUpdate => {
	const update: RewardUpdate = {};

	if (featureGrant.name !== undefined) update.name = featureGrant.name;

	if (featureGrant.promo_codes !== undefined) {
		update.promo_codes = featureGrant.promo_codes.map(({ code, max_uses }) => ({
			code,
			global_max_redemption: max_uses ?? undefined,
		}));
	}

	if (featureGrant.grants !== undefined) {
		update.entitlements = featureGrant.grants.map((grant) => {
			const feature = findFeatureById({
				features,
				featureId: grant.feature_id,
			});

			if (!feature) {
				throw new RecaseError({
					message: `Feature ${grant.feature_id} not found`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			if (
				(feature.type === FeatureType.Boolean) !==
				(grant.included === null)
			) {
				throw new RecaseError({
					message:
						feature.type === FeatureType.Boolean
							? `Feature ${feature.id} must have included set to null`
							: `Feature ${feature.id} must have a positive included value`,
					code: ErrCode.InvalidReward,
					statusCode: 400,
				});
			}

			return {
				internal_feature_id: feature.internal_id,
				allowance: grant.included ?? undefined,
				expiry: grant.expiry
					? { duration: grant.expiry.type, length: grant.expiry.length }
					: undefined,
			};
		});
	}

	return update;
};

/** The body must describe the same kind of reward that is stored */
const assertBodyMatchesRewardType = ({
	reward,
	params,
}: {
	reward: Reward;
	params: UpdateRewardParams;
}) => {
	const isFeatureGrant = reward.type === RewardType.FeatureGrant;
	const expected = isFeatureGrant ? "feature_grant" : "coupon";

	if (isFeatureGrant ? !params.feature_grant : !params.coupon) {
		throw new RecaseError({
			message: `Reward ${params.reward_id} is a ${expected.replace("_", " ")} — provide ${expected}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

/** Stripe cannot update coupons in place, so the discount is deleted and recreated */
const recreateStripeCoupon = async ({
	ctx,
	previous,
	updated,
}: {
	ctx: AutumnContext;
	previous: Reward;
	updated: Reward;
}) => {
	const { org, env, logger } = ctx;
	const prices: (Price & { product: Product })[] = await getRewardPrices({
		ctx,
		priceIds: updated.discount_config?.price_ids ?? [],
	});

	// Preflight before deleting, so a plan missing in Stripe fails the update
	// while the existing coupon is still intact.
	resolveCouponStripeProductIds({ reward: updated, prices });

	const stripeCli = createStripeCli({ org, env });
	try {
		await stripeCli.coupons.del(previous.id);
		await stripeCli.coupons.del(previous.internal_id);
	} catch (_) {}

	await createStripeCoupon({ reward: updated, org, env, prices, logger });
};

export const updateApiReward = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateRewardParams;
}): Promise<UpdateRewardResponse> => {
	const { db, org, env, features } = ctx;

	// 1. Load and validate the body against the stored reward
	const reward = await requireApiReward({ ctx, rewardId: params.reward_id });
	assertBodyMatchesRewardType({ reward, params });

	const isFeatureGrant = reward.type === RewardType.FeatureGrant;

	// 2. Build the patch
	const update = isFeatureGrant
		? buildFeatureGrantUpdate({ features, featureGrant: params.feature_grant! })
		: await buildCouponUpdate({ ctx, reward, coupon: params.coupon! });

	const updatedReward: Reward = { ...reward, ...update };

	await validateRewardUniqueness({
		db,
		reward: updatedReward,
		orgId: org.id,
		env,
		excludeInternalId: reward.internal_id,
	});

	// 3. Feature grants have no Stripe coupon; discounts must be recreated
	if (!isFeatureGrant) {
		await recreateStripeCoupon({
			ctx,
			previous: reward,
			updated: updatedReward,
		});
	}

	// 4. Persist. The repo always issues a SET, so keep at least one column.
	await rewardRepo.update({
		db,
		internalId: reward.internal_id,
		env,
		orgId: org.id,
		update: { name: updatedReward.name, ...update },
	});

	// Re-read: the update only returns joined entitlements when it rewrote them
	const saved = await requireApiReward({ ctx, rewardId: reward.internal_id });

	return toApiRewardResponse({ ctx, reward: saved });
};
