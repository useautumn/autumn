import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import {
	AllowanceType,
	type EntitlementWithFeature,
} from "../../../models/productModels/entModels/entModels.js";
import type { FixedPriceConfig } from "../../../models/productModels/priceModels/priceConfig/fixedPriceConfig.js";
import {
	BillWhen,
	type UsagePriceConfig,
} from "../../../models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import type { Price } from "../../../models/productModels/priceModels/priceModels.js";
import { Infinite } from "../../../models/productModels/productEnums.js";
import {
	type ProductItem,
	ProductItemFeatureType,
	TierInfinite,
	UsageModel,
} from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { nullish } from "../../utils.js";
import {
	billingToItemInterval,
	entToItemInterval,
} from "./productItemUtils.js";

export const toProductItem = ({
	ent,
	price,
}: {
	ent?: EntitlementWithFeature;
	price?: Price;
}) => {
	if (nullish(price)) return toFeatureItem({ ent: ent! }) as ProductItem;
	if (nullish(ent)) return toPriceItem({ price: price! }) as ProductItem;

	return toFeaturePriceItem({ ent: ent!, price: price! }) as ProductItem;
};

export const toFeatureItem = ({ ent }: { ent: EntitlementWithFeature }) => {
	if (ent.feature.type == FeatureType.Boolean) {
		return {
			feature_id: ent.feature.id,
			entitlement_id: ent.id,
			entity_feature_id: ent.entity_feature_id,
		};
	}

	const itemConfig = ent.rollover ? { rollover: ent.rollover } : undefined;

	const item = {
		feature_id: ent.feature.id,
		included_usage:
			ent.allowance_type == AllowanceType.Unlimited ? Infinite : ent.allowance,
		interval: entToItemInterval(ent.interval!),
		interval_count: ent.interval_count ?? 1,

		entity_feature_id: ent.entity_feature_id,
		reset_usage_when_enabled: !ent.carry_from_previous,

		// Include rollover config
		config: itemConfig,

		// Stored in backend
		entitlement_id: ent.id,
		created_at: ent.created_at,
	};

	return item;
};

export const toFeaturePriceItem = ({
	ent,
	price,
}: {
	ent: EntitlementWithFeature;
	price: Price;
}) => {
	const config = price.config as UsagePriceConfig;
	const tiers = config.usage_tiers.map((tier) => {
		return {
			amount: tier.amount,
			to: tier.to == -1 ? TierInfinite : tier.to,
		};
	});

	// Build the item config from both price proration config and entitlement rollover
	let itemConfig: any = {};
	if (price.proration_config) {
		itemConfig = { ...price.proration_config };
	}
	if (ent.rollover) {
		itemConfig.rollover = ent.rollover;
	}

	const item: ProductItem = {
		feature_id: ent.feature.id,
		feature_type:
			ent.feature.config?.usage_type || ProductItemFeatureType.SingleUse,

		included_usage: ent.allowance,

		interval: billingToItemInterval(config.interval!),
		interval_count: config.interval_count ?? 1,

		price: null,
		tiers,
		billing_units: config.billing_units,

		entity_feature_id: ent.entity_feature_id,
		reset_usage_when_enabled: !ent.carry_from_previous,
		usage_model:
			config.bill_when == BillWhen.StartOfPeriod ||
			config.bill_when == BillWhen.InAdvance
				? UsageModel.Prepaid
				: UsageModel.PayPerUse,

		// Stored in backend
		created_at: ent.created_at,
		entitlement_id: ent.id,
		price_id: price.id,

		price_config: price.config,
		config: Object.keys(itemConfig).length > 0 ? itemConfig : undefined,
		usage_limit: ent.usage_limit,
	};

	return item;
};

export const toPriceItem = ({ price }: { price: Price }) => {
	const config = price.config as FixedPriceConfig;
	return {
		feature_id: null,

		interval: billingToItemInterval(config.interval!),
		interval_count: config.interval_count ?? 1,
		price: config.amount,

		price_id: price.id,
		created_at: price.created_at,

		price_config: price.config,
	};
};
