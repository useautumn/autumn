import {
	CouponDurationType,
	type CreateReward,
	RewardType,
} from "@autumn/shared";

/**
 * 100% discount for 1 month
 * @param id - Reward ID (default: "month-off")
 */
const monthOff = ({
	id = "month-off",
}: {
	id?: string;
} = {}): CreateReward => ({
	id,
	name: "Month Off",
	type: RewardType.PercentageDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: 100,
		duration_type: CouponDurationType.Months,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
});

/**
 * 50% discount for 1 month
 * @param id - Reward ID (default: "half-off")
 */
const halfOff = ({ id = "half-off" }: { id?: string } = {}): CreateReward => ({
	id,
	name: "Half Off",
	type: RewardType.PercentageDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: 50,
		duration_type: CouponDurationType.Months,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
});

/**
 * $10 fixed discount for 1 month
 * @param id - Reward ID (default: "ten-off")
 */
const tenOff = ({ id = "ten-off" }: { id?: string } = {}): CreateReward => ({
	id,
	name: "$10 Off",
	type: RewardType.FixedDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: 10,
		duration_type: CouponDurationType.Months,
		duration_value: 1,
		apply_to_all: true,
		price_ids: [],
	},
});

/**
 * Percentage discount with configurable value and duration
 * @param id - Reward ID (default: "percentage-discount")
 * @param discountValue - Percentage off (default: 100)
 * @param durationMonths - Number of months (default: 1)
 */
const percentageDiscount = ({
	id = "percentage-discount",
	discountValue = 100,
	durationMonths = 1,
}: {
	id?: string;
	discountValue?: number;
	durationMonths?: number;
} = {}): CreateReward => ({
	id,
	name: `${discountValue}% Off`,
	type: RewardType.PercentageDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: discountValue,
		duration_type: CouponDurationType.Months,
		duration_value: durationMonths,
		apply_to_all: true,
		price_ids: [],
	},
});

/**
 * Fixed amount discount with configurable value and duration
 * @param id - Reward ID (default: "fixed-discount")
 * @param discountValue - Amount off in dollars (default: 10)
 * @param durationMonths - Number of months (default: 1)
 */
const fixedDiscount = ({
	id = "fixed-discount",
	discountValue = 10,
	durationMonths = 1,
}: {
	id?: string;
	discountValue?: number;
	durationMonths?: number;
} = {}): CreateReward => ({
	id,
	name: `$${discountValue} Off`,
	type: RewardType.FixedDiscount,
	promo_codes: [],
	discount_config: {
		discount_value: discountValue,
		duration_type: CouponDurationType.Months,
		duration_value: durationMonths,
		apply_to_all: true,
		price_ids: [],
	},
});

/**
 * Free product reward — grants a free product to referrer/redeemer
 * @param id - Reward ID (default: "free-product")
 * @param freeProductId - The product ID to grant
 */
const freeProduct = ({
	id = "free-product",
	freeProductId,
}: {
	id?: string;
	freeProductId: string;
}): CreateReward => ({
	id,
	name: "Free Product",
	type: RewardType.FreeProduct,
	promo_codes: [],
	free_product_id: freeProductId,
});

export const rewards = {
	monthOff,
	halfOff,
	tenOff,
	percentageDiscount,
	fixedDiscount,
	freeProduct,
} as const;
