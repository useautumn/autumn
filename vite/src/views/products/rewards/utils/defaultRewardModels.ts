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

const defaultFreeProductConfig: FreeProductConfig = {
	duration_type: CouponDurationType.Months,
	duration_value: 0,
};

const defaultReward: CreateReward = {
	name: "",
	id: "",
	promo_codes: [{ code: "" }],

	type: RewardType.PercentageDiscount,

	free_product_id: null,

	discount_config: defaultDiscountConfig,

	free_product_config: defaultFreeProductConfig,
};
