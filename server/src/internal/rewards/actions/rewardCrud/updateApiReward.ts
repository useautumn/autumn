import {
	ErrCode,
	type CreateRewardParams,
	type Feature,
	FeatureNotFoundError,
	FeatureType,
	findFeatureById,
	normalizePromoCodes,
	type Price,
	type Product,
	RecaseError,
	type Reward,
	type RewardEntitlement,
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
import { rewardRepo } from "../../repos/index.js";
import { getRewardPrices } from "../getRewardPrices.js";
import { validateRewardUniqueness } from "../validateRewardUniqueness.js";
import { requireApiReward, toApiRewardResponse } from "./apiRewardUtils.js";

type CouponUpdate = NonNullable<UpdateRewardParams["coupon"]> &
	Partial<
		Pick<
			NonNullable<CreateRewardParams["coupon"]>,
			"type" | "value" | "duration"
		>
	>;
type FeatureGrantUpdate = NonNullable<UpdateRewardParams["feature_grant"]>;

/** Entitlements here are reward-entitlement inputs, not full Entitlement rows */
type RewardUpdate = Partial<Omit<Reward, "entitlements">> & {
	entitlements?: RewardEntitlement[];
};

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
	if (coupon.type !== undefined) update.type = coupon.type;

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

	const discountConfig = { ...reward.discount_config! };
	let discountConfigChanged = false;
	if (coupon.value !== undefined) {
		discountConfig.discount_value = coupon.value;
		discountConfigChanged = true;
	}
	if (coupon.duration !== undefined) {
		discountConfig.duration_type = coupon.duration.type;
		discountConfig.duration_value = coupon.duration.length ?? 0;
		discountConfigChanged = true;
	}

	if (coupon.plan_ids !== undefined) {
		discountConfig.apply_to_all = coupon.plan_ids === null;
		discountConfig.price_ids =
			coupon.plan_ids === null
				? []
				: await planIdsToPriceIds({ ctx, planIds: coupon.plan_ids });
		discountConfig.product_ids = coupon.plan_ids ?? undefined;
		discountConfigChanged = true;
	}
	if (discountConfigChanged) update.discount_config = discountConfig;

	return update;
};

const planIdsToPriceIds = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	const plans = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: planIds,
	});

	if (plans.length !== planIds.length) {
		const found = new Set(plans.map((plan) => plan.id));
		const missing = planIds.filter((planId) => !found.has(planId));
		throw new RecaseError({
			message: `Plans not found: ${missing.join(", ")}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return plans.flatMap((plan) => plan.prices.map((price) => price.id));
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
				throw new FeatureNotFoundError({ featureId: grant.feature_id });
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

	const updatedReward = { ...reward, ...update } as Reward;

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

	// 4. Persist. The repo strips entitlements before its SET, so a grants-only
	// patch would leave no columns to write — keep name in that case.
	const { entitlements, ...rewardColumns } = update;
	await rewardRepo.update({
		db,
		internalId: reward.internal_id,
		env,
		orgId: org.id,
		update:
			Object.keys(rewardColumns).length > 0
				? update
				: { ...update, name: reward.name },
		features,
	});

	// Re-read: the update only returns joined entitlements when it rewrote them
	const saved = await requireApiReward({ ctx, rewardId: reward.internal_id });

	return toApiRewardResponse({ ctx, reward: saved });
};
