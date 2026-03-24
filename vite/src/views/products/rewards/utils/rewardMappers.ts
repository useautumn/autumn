import { type CreateReward, type Feature, RewardType } from "@autumn/shared";
import type {
	FrontendDiscountType,
	FrontendReward,
	FrontendRewardCategory,
} from "../types/frontendReward";

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

	if (rewardCategory === "feature_grant") {
		type = RewardType.FeatureGrant;
	} else if (rewardCategory === "free_product") {
		type = RewardType.FreeProduct;
	} else if (discountType === "percentage") {
		type = RewardType.PercentageDiscount;
	} else if (discountType === "fixed") {
		type = RewardType.FixedDiscount;
	} else if (discountType === "invoice_credits") {
		type = RewardType.InvoiceCredits;
	} else {
		type = RewardType.PercentageDiscount;
	}

	const result: CreateReward = {
		...baseReward,
		type,
	};

	// Map frontend feature_id → internal_feature_id for feature grant entitlements
	if (rewardCategory === "feature_grant" && featureGrantEntitlements?.length) {
		result.entitlements = featureGrantEntitlements
			.filter((e) => e.feature_id && e.allowance > 0)
			.map((e) => {
				const feature = features?.find((f) => f.id === e.feature_id);
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
	apiReward: CreateReward;
	features?: Feature[];
}): FrontendReward {
	let rewardCategory: FrontendRewardCategory | null = null;
	let discountType: FrontendDiscountType | null = null;

	if (apiReward.type === RewardType.FeatureGrant) {
		rewardCategory = "feature_grant";
	} else if (apiReward.type === RewardType.FreeProduct) {
		rewardCategory = "free_product";
	} else {
		rewardCategory = "discount";
		if (apiReward.type === RewardType.PercentageDiscount) {
			discountType = "percentage";
		} else if (apiReward.type === RewardType.FixedDiscount) {
			discountType = "fixed";
		} else if (apiReward.type === RewardType.InvoiceCredits) {
			discountType = "invoice_credits";
		}
	}

	const { type, entitlements, ...baseReward } = apiReward;

	// Map internal_feature_id → feature_id for display
	const featureGrantEntitlements = (entitlements ?? []).map((e) => {
		const feature = features?.find(
			(f) => f.internal_id === e.internal_feature_id,
		);
		return {
			feature_id: feature?.id ?? e.internal_feature_id,
			allowance: e.allowance,
			expiry: e.expiry,
		};
	});

	return {
		...baseReward,
		rewardCategory,
		discountType,
		featureGrantEntitlements,
	};
}
