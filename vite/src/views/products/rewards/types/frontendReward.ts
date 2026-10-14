import type { CreateReward, EntitlementDuration } from "@autumn/shared";

export enum FrontendRewardCategory {
	Discount = "discount",
	FreeProduct = "free_product",
	FeatureGrant = "feature_grant",
}

export enum FrontendDiscountType {
	Percentage = "percentage",
	Fixed = "fixed",
	InvoiceCredits = "invoice_credits",
}

export interface FrontendRewardEntitlement {
	feature_id: string;
	allowance?: number;
	expiry?: {
		duration: EntitlementDuration;
		length: number;
	};
}

export interface FrontendReward extends Omit<CreateReward, "type"> {
	rewardCategory: FrontendRewardCategory | null;
	discountType: FrontendDiscountType | null;
	featureGrantEntitlements: FrontendRewardEntitlement[];
}
