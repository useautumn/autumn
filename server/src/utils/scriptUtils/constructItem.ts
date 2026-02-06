import {
	type LimitedItem,
	OnDecrease,
	OnIncrease,
	type ProductItem,
	type ProductItemConfig,
	type ProductItemFeatureType,
	ProductItemInterval,
	type RolloverConfig,
	UsageModel,
} from "@autumn/shared";

/*
 **  Only required for more complex features, consider using items in the test fixtures instead
 */
export const constructFeatureItem = ({
	featureId,
	includedUsage = 150,
	interval = ProductItemInterval.Month,
	intervalCount = 1,
	entityFeatureId,
	isBoolean = false,
	unlimited = false,
	rolloverConfig,
	featureType,
}: {
	featureId: string;
	includedUsage?: number;
	interval?: ProductItemInterval | null;
	intervalCount?: number;
	entityFeatureId?: string;
	isBoolean?: boolean;
	rolloverConfig?: RolloverConfig;
	featureType?: ProductItemFeatureType;
	unlimited?: boolean;
}) => {
	if (isBoolean) {
		return {
			feature_id: featureId,
			entity_feature_id: entityFeatureId,
		};
	}

	if (unlimited) {
		return {
			feature_id: featureId,
			included_usage: "inf",
		} as ProductItem;
	}
	const item: LimitedItem = {
		feature_id: featureId,
		included_usage: includedUsage,
		entity_feature_id: entityFeatureId,
		feature_type: featureType,
		interval: interval,
		interval_count: intervalCount,
	};

	if (rolloverConfig) {
		item.config = {
			rollover: rolloverConfig,
		};
	}

	return item;
};

export const constructPrepaidItem = ({
	featureId,
	price = 9,
	tiers,
	billingUnits = 100,
	includedUsage = 0,
	isOneOff = false,
	config = {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
	rolloverConfig,
	usageLimit,
	intervalCount = 1,
	resetUsageWhenEnabled,
	entityFeatureId,
}: {
	featureId: string;
	price?: number;
	tiers?: { amount: number; to: number | "inf" }[];
	billingUnits?: number;
	includedUsage?: number;
	isOneOff?: boolean;
	config?: ProductItemConfig;
	rolloverConfig?: RolloverConfig;
	usageLimit?: number;
	intervalCount?: number;
	resetUsageWhenEnabled?: boolean;
	entityFeatureId?: string;
}) => {
	const item: ProductItem = {
		feature_id: featureId,
		usage_model: UsageModel.Prepaid,

		price: tiers ? undefined : price,
		tiers: tiers,
		billing_units: billingUnits || 100,
		interval: isOneOff ? null : ProductItemInterval.Month,
		interval_count: intervalCount,
		included_usage: includedUsage,

		config: {
			...config,
			...(rolloverConfig ? { rollover: rolloverConfig } : {}),
		},
		usage_limit: usageLimit,
		reset_usage_when_enabled: resetUsageWhenEnabled,
		entity_feature_id: entityFeatureId,
	};

	return item;
};

export const constructArrearItem = ({
	featureId,
	includedUsage = 10000,
	price = 0.1,
	billingUnits = 1000,
	config = {
		on_increase: OnIncrease.ProrateImmediately,
		on_decrease: OnDecrease.ProrateImmediately,
	},
	rolloverConfig,
	entityFeatureId,
	usageLimit,
	interval = ProductItemInterval.Month,
	intervalCount = 1,
}: {
	featureId: string;
	includedUsage?: number;
	price?: number;
	billingUnits?: number;
	config?: ProductItemConfig;
	rolloverConfig?: RolloverConfig;
	entityFeatureId?: string;
	usageLimit?: number;
	interval?: ProductItemInterval;
	intervalCount?: number;
}) => {
	const item: ProductItem = {
		feature_id: featureId,
		usage_model: UsageModel.PayPerUse,
		included_usage: includedUsage,
		price: price,
		billing_units: billingUnits,
		interval: interval,
		interval_count: intervalCount,
		reset_usage_when_enabled: true,
		config: {
			...config,
			...(rolloverConfig ? { rollover: rolloverConfig } : {}),
		},
		entity_feature_id: entityFeatureId,
		usage_limit: usageLimit,
	};

	return item;
};

export const constructArrearProratedItem = ({
	featureId,
	featureType,
	pricePerUnit = 10,
	includedUsage = 1,
	config = {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
	usageLimit,
	rolloverConfig,
	interval = ProductItemInterval.Month,
}: {
	featureId: string;
	featureType?: ProductItemFeatureType;
	pricePerUnit?: number;
	includedUsage?: number;
	config?: ProductItemConfig;
	usageLimit?: number;
	rolloverConfig?: RolloverConfig;
	interval?: ProductItemInterval;
}) => {
	const item: ProductItem = {
		feature_id: featureId,
		usage_model: UsageModel.PayPerUse,
		included_usage: includedUsage,
		price: pricePerUnit,
		billing_units: 1,
		interval: interval || ProductItemInterval.Month,
		config: {
			...config,
			...(rolloverConfig ? { rollover: rolloverConfig } : {}),
		},
		usage_limit: usageLimit,
		...(featureType ? { feature_type: featureType } : {}),
	};

	return item;
};

export const constructFixedPrice = ({
	price,
	interval = ProductItemInterval.Month,
}: {
	price: number;
	interval?: ProductItemInterval;
}) => {
	return {
		price,
		interval,
	};
};
