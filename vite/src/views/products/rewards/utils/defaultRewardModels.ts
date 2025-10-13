import {
	CouponDurationType,
	type CreateReward,
	type DiscountConfig,
	type FreeProductConfig,
	RewardType,
} from "@autumn/shared";

export const defaultDiscountConfig: DiscountConfig = {
	discount_value: 0,
	duration_type: CouponDurationType.Months,
	duration_value: 0,
	should_rollover: true,
	apply_to_all: false,
	price_ids: [],
};

export const defaultFreeProductConfig: FreeProductConfig = {
	duration_type: CouponDurationType.Months,
	duration_value: 0,
};

export const defaultReward: CreateReward = {
	name: "",
	id: "",
	promo_codes: [{ code: "" }],

	type: RewardType.PercentageDiscount,

	// For free product coupons
	free_product_id: null,

	// For discount type coupons
	discount_config: defaultDiscountConfig,

	// For free product type coupons
	free_product_config: defaultFreeProductConfig,
};
