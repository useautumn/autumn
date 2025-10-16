import { type CreateReward, RewardType } from "@autumn/shared";
import type {
	FrontendDiscountType,
	FrontendReward,
	FrontendRewardCategory,
} from "../types/frontendReward";

/**
 * Maps frontend reward to API reward type
 */
export function mapFrontendToApiReward(
	frontendReward: FrontendReward,
): CreateReward {
	const { rewardCategory, discountType, ...baseReward } = frontendReward;

	// Determine the API reward type based on frontend category and discount type
	let type: RewardType;

	if (rewardCategory === "free_product") {
		type = RewardType.FreeProduct;
	} else if (discountType === "percentage") {
		type = RewardType.PercentageDiscount;
	} else if (discountType === "fixed") {
		type = RewardType.FixedDiscount;
	} else if (discountType === "invoice_credits") {
		type = RewardType.InvoiceCredits;
	} else {
		// Default fallback
		type = RewardType.PercentageDiscount;
	}

	return {
		...baseReward,
		type,
	};
}

/**
 * Maps API reward to frontend reward
 */
export function mapApiToFrontendReward(
	apiReward: CreateReward,
): FrontendReward {
	let rewardCategory: FrontendRewardCategory | null = null;
	let discountType: FrontendDiscountType | null = null;

	if (apiReward.type === RewardType.FreeProduct) {
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

	const { type, ...baseReward } = apiReward;

	return {
		...baseReward,
		rewardCategory,
		discountType,
	};
}
