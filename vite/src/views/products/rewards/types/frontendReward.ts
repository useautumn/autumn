import type { CreateReward } from "@autumn/shared";

/**
 * Frontend-only reward category to separate UI concerns from API types
 */
export enum FrontendRewardCategory {
	Discount = "discount",
	FreeProduct = "free_product",
}

/**
 * Frontend-only discount type for UI
 */
export enum FrontendDiscountType {
	Percentage = "percentage",
	Fixed = "fixed",
	InvoiceCredits = "invoice_credits",
}

/**
 * Extended reward type for frontend with separated concerns
 */
export interface FrontendReward extends Omit<CreateReward, "type"> {
	// Frontend-specific fields
	rewardCategory: FrontendRewardCategory | null;
	discountType: FrontendDiscountType | null;
}
