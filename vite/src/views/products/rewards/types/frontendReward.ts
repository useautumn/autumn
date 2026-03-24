import type { CreateReward, FeatureGrantDuration } from "@autumn/shared";

/**
 * Frontend-only reward category to separate UI concerns from API types
 */
export enum FrontendRewardCategory {
	Discount = "discount",
	FreeProduct = "free_product",
	FeatureGrant = "feature_grant",
}

/**
 * Frontend-only discount type for UI
 */
export enum FrontendDiscountType {
	Percentage = "percentage",
	Fixed = "fixed",
	InvoiceCredits = "invoice_credits",
}

/** Frontend entitlement config for feature grant rewards */
export interface FrontendRewardEntitlement {
	feature_id: string;
	allowance: number;
	expiry?: {
		duration: FeatureGrantDuration;
		length: number;
	};
}

/**
 * Extended reward type for frontend with separated concerns
 */
export interface FrontendReward extends Omit<CreateReward, "type"> {
	// Frontend-specific fields
	rewardCategory: FrontendRewardCategory | null;
	discountType: FrontendDiscountType | null;
	// Feature grant entitlements (frontend uses feature_id, mapped to internal_feature_id on submit)
	featureGrantEntitlements: FrontendRewardEntitlement[];
}
