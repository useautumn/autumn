import {
	type CreateReward,
	type Feature,
	findFeatureById,
	findFeatureByInternalId,
	type Reward,
	RewardType,
} from "@autumn/shared";
import {
	FrontendDiscountType,
	type FrontendReward,
	FrontendRewardCategory,
} from "../types/frontendReward";

type ApiRewardEntitlement =
	| NonNullable<CreateReward["entitlements"]>[number]
	| NonNullable<Reward["entitlements"]>[number];
type ApiPromoCode = CreateReward["promo_codes"][number];

const normalizePromoCode = ({
	code,
	global_max_redemption,
	max_redemptions,
	first_time_transaction,
}: ApiPromoCode): ApiPromoCode => {
	const globalMaxRedemption = global_max_redemption ?? max_redemptions;

	return {
		code,
		...(globalMaxRedemption !== undefined
			? { global_max_redemption: globalMaxRedemption }
			: {}),
		...(first_time_transaction ? { first_time_transaction: true } : {}),
	};
};

const getFrontendExpiry = (entitlement: ApiRewardEntitlement) => {
	if ("expiry" in entitlement && entitlement.expiry) {
		return entitlement.expiry;
	}

	if (
		"expiry_duration" in entitlement &&
		entitlement.expiry_duration &&
		entitlement.expiry_length != null
	) {
		return {
			duration: entitlement.expiry_duration,
			length: entitlement.expiry_length,
		};
	}

	return undefined;
};

/**
 * Maps frontend reward to API reward type
 */
export function mapFrontendToApiReward({
	frontendReward,
	features,
}: {
	frontendReward: FrontendReward;
	features?: Feature[];
}): CreateReward {
	const {
		rewardCategory,
		discountType,
		featureGrantEntitlements,
		...baseReward
	} = frontendReward;

	// Determine the API reward type based on frontend category and discount type
	let type: RewardType;

	if (rewardCategory === FrontendRewardCategory.FeatureGrant) {
		type = RewardType.FeatureGrant;
	} else if (rewardCategory === FrontendRewardCategory.FreeProduct) {
		type = RewardType.FreeProduct;
	} else if (discountType === FrontendDiscountType.Percentage) {
		type = RewardType.PercentageDiscount;
	} else if (discountType === FrontendDiscountType.Fixed) {
		type = RewardType.FixedDiscount;
	} else if (discountType === FrontendDiscountType.InvoiceCredits) {
		type = RewardType.InvoiceCredits;
	} else {
		type = RewardType.PercentageDiscount;
	}

	const result: CreateReward = {
		...baseReward,
		promo_codes: (baseReward.promo_codes ?? []).map(normalizePromoCode),
		type,
	};

	// Map frontend feature_id → internal_feature_id for feature grant entitlements
	if (
		rewardCategory === FrontendRewardCategory.FeatureGrant &&
		featureGrantEntitlements?.length
	) {
		result.entitlements = featureGrantEntitlements.map((e) => {
			const feature = features
				? findFeatureById({ features, featureId: e.feature_id })
				: undefined;
			return {
				internal_feature_id: feature?.internal_id ?? e.feature_id,
				allowance: e.allowance,
				expiry: e.expiry,
			};
		});
	}

	return result;
}

/**
 * Maps API reward to frontend reward
 */
export function mapApiToFrontendReward({
	apiReward,
	features,
}: {
	apiReward: CreateReward | Reward;
	features?: Feature[];
}): FrontendReward {
	let rewardCategory: FrontendRewardCategory | null = null;
	let discountType: FrontendDiscountType | null = null;

	if (apiReward.type === RewardType.FeatureGrant) {
		rewardCategory = FrontendRewardCategory.FeatureGrant;
	} else if (apiReward.type === RewardType.FreeProduct) {
		rewardCategory = FrontendRewardCategory.FreeProduct;
	} else {
		rewardCategory = FrontendRewardCategory.Discount;
		if (apiReward.type === RewardType.PercentageDiscount) {
			discountType = FrontendDiscountType.Percentage;
		} else if (apiReward.type === RewardType.FixedDiscount) {
			discountType = FrontendDiscountType.Fixed;
		} else if (apiReward.type === RewardType.InvoiceCredits) {
			discountType = FrontendDiscountType.InvoiceCredits;
		}
	}

	const { type, entitlements, ...baseReward } = apiReward;

	// Map internal_feature_id → feature_id for display
	const featureGrantEntitlements = (entitlements ?? []).map((e) => {
		const feature = features
			? findFeatureByInternalId({
					features,
					internalId: e.internal_feature_id,
				})
			: undefined;
		return {
			feature_id: feature?.id ?? e.internal_feature_id,
			allowance: e.allowance ?? 0,
			expiry: getFrontendExpiry(e),
		};
	});

	return {
		...baseReward,
		rewardCategory,
		discountType,
		featureGrantEntitlements,
	};
}
