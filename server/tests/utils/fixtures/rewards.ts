import {
	CouponDurationType,
	type CreateReward,
	RewardType,
} from "@autumn/shared";

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

const featureGrant = ({
	id = "feature-grant",
	internalFeatureId,
	allowance = 100,
	promoCode = "FEATUREGRANT",
}: {
	id?: string;
	internalFeatureId: string;
	allowance?: number;
	promoCode?: string;
}): CreateReward => ({
	id,
	name: "Feature Grant",
	type: RewardType.FeatureGrant,
	promo_codes: [{ code: promoCode }],
	entitlements: [
		{
			internal_feature_id: internalFeatureId,
			allowance,
		},
	],
});

export const rewards = {
	monthOff,
	halfOff,
	tenOff,
	percentageDiscount,
	fixedDiscount,
	freeProduct,
	featureGrant,
} as const;
