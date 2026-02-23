import {
	AllowanceType,
	BillingInterval,
	BillingType,
	BillWhen,
	EntInterval,
	type Entitlement,
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FixedPriceConfig,
	Infinite,
	itemToBillingInterval,
	itemToEntInterval,
	OnDecrease,
	OnIncrease,
	type Price,
	PriceType,
	type ProductItem,
	shouldProrate,
	TierInfinite,
	UsageModel,
	type UsagePriceConfig,
} from "@autumn/shared";
import { entsAreSame } from "@server/internal/products/entitlements/entitlementUtils";
import { pricesAreSame } from "@server/internal/products/prices/priceInitUtils";
import { getBillingType } from "@server/internal/products/prices/priceUtils";
import { itemCanBeProrated } from "@server/internal/products/product-items/productItemUtils/classifyItem";
import RecaseError from "@server/utils/errorUtils";
import { generateId, notNullish, nullish } from "@server/utils/genUtils";
import {
	isFeatureItem,
	isFeaturePriceItem,
	isPriceItem,
} from "./getItemType.js";

const getResetUsage = ({
	item,
	feature,
}: {
	item: ProductItem;
	feature?: Feature;
}) => {
	if (!item.feature_id) {
		return undefined;
	}
	if (
		nullish(item.reset_usage_when_enabled) &&
		(isFeatureItem(item) || isFeaturePriceItem(item)) &&
		feature
	) {
		return feature?.config?.usage_type === FeatureUsageType.Single;
	}
	return item.reset_usage_when_enabled;
};
// ITEM TO PRICE AND ENTITLEMENT
const toPrice = ({
	item,
	orgId,
	internalProductId,
	isCustom,
	newVersion,
	curPrice,
}: {
	item: ProductItem;
	orgId: string;
	internalProductId: string;
	isCustom: boolean;
	newVersion?: boolean;
	curPrice?: Price;
}) => {
	const config: FixedPriceConfig = {
		type: PriceType.Fixed,
		amount: notNullish(item.price) ? item.price : item.tiers![0].amount,
		interval: itemToBillingInterval({ item }) as BillingInterval,
		interval_count: item.interval_count || 1,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
	};

	let price: Price = {
		id: item.price_id || curPrice?.id || generateId("pr"),
		created_at: item.created_at || Date.now(),
		org_id: orgId,
		internal_product_id: internalProductId,
		is_custom: isCustom,
		config,
		proration_config: null,
	};

	if (isCustom || newVersion) {
		price = {
			...price,
			id: generateId("pr"),
			created_at: Date.now(),
		};
	}

	return { price, ent: null };
};

export const toFeature = ({
	item,
	orgId,
	internalFeatureId,
	internalProductId,
	isCustom,
	newVersion,
	feature,
	curEnt,
}: {
	item: ProductItem;
	orgId: string;
	internalFeatureId: string;
	internalProductId?: string;
	isCustom: boolean;
	newVersion?: boolean;
	feature?: Feature;
	curEnt?: Entitlement;
}) => {
	const isBoolean = feature?.type === FeatureType.Boolean;

	const resetUsage = getResetUsage({ item, feature });

	let ent: Entitlement = {
		id: item.entitlement_id || curEnt?.id || generateId("ent"),
		org_id: orgId,
		created_at: item.created_at || Date.now(),
		is_custom: isCustom,
		internal_product_id: internalProductId || null,

		internal_feature_id: internalFeatureId,
		feature_id: item.feature_id!,

		allowance: item.included_usage === Infinite ? null : item.included_usage!,
		allowance_type: isBoolean
			? null
			: item.included_usage === Infinite
				? AllowanceType.Unlimited
				: AllowanceType.Fixed,

		interval: isBoolean ? null : (itemToEntInterval({ item }) as EntInterval),
		interval_count: item.interval_count || 1,

		carry_from_previous: !resetUsage,
		entity_feature_id: item.entity_feature_id,
		usage_limit: null,

		rollover: item.config?.rollover,
	};

	if (isCustom || newVersion) {
		ent = {
			...ent,
			id: generateId("ent"),
			created_at: Date.now(),
		};
	}
	return { price: null, ent };
};

const toFeatureAndPrice = ({
	item,
	orgId,
	internalFeatureId,
	internalProductId,
	isCustom,
	curPrice,
	curEnt,
	newVersion,
	features,
}: {
	item: ProductItem;
	orgId: string;
	internalFeatureId: string;
	internalProductId: string;
	isCustom: boolean;
	curPrice?: Price;
	curEnt?: Entitlement;
	newVersion?: boolean;
	features: Feature[];
}) => {
	const resetUsage = getResetUsage({
		item,
		feature: features.find((f) => f.id === item.feature_id),
	});

	let ent: Entitlement = {
		id: item.entitlement_id || curEnt?.id || generateId("ent"),
		org_id: orgId,
		created_at: item.created_at || Date.now(),
		is_custom: isCustom,
		internal_product_id: internalProductId,

		internal_feature_id: internalFeatureId,
		feature_id: item.feature_id!,

		allowance: (item.included_usage as number) || 0,
		allowance_type: AllowanceType.Fixed,
		interval: itemToEntInterval({ item }) as EntInterval,
		interval_count: item.interval_count || 1,

		carry_from_previous: !resetUsage,
		entity_feature_id: item.entity_feature_id,
		usage_limit: item.usage_limit || null,

		rollover: item.config?.rollover,
	};

	// Will only create new ent id if
	const newEnt = !curEnt || (isCustom && !entsAreSame(curEnt, ent));
	if (newEnt || newVersion) {
		ent = {
			...ent,
			id: generateId("ent"),
			created_at: Date.now(),
		};
	}

	const entInterval = itemToEntInterval({ item });

	const config: UsagePriceConfig = {
		type: PriceType.Usage,

		bill_when:
			item.usage_model === UsageModel.Prepaid
				? BillWhen.StartOfPeriod
				: BillWhen.EndOfPeriod,

		billing_units: item.billing_units || 1,
		should_prorate: entInterval === EntInterval.Lifetime,

		internal_feature_id: internalFeatureId,
		feature_id: item.feature_id!,
		usage_tiers: notNullish(item.price)
			? [
					{
						amount: item.price,
						to: TierInfinite,
					},
				]
			: (item.tiers as any),
		interval: itemToBillingInterval({ item }) as BillingInterval,
		interval_count: item.interval_count || 1,
	};

	const canProrate = itemCanBeProrated({ item, features });

	let prorationConfig = null;
	if (canProrate) {
		const onIncrease =
			item.config?.on_increase || OnIncrease.ProrateImmediately;
		let onDecrease = item.config?.on_decrease || OnDecrease.Prorate;

		if (shouldProrate(onDecrease) || onDecrease === OnDecrease.Prorate) {
			onDecrease =
				onIncrease === OnIncrease.ProrateImmediately ||
				onIncrease === OnIncrease.BillImmediately
					? OnDecrease.ProrateImmediately
					: OnDecrease.ProrateNextCycle;
		}

		prorationConfig = {
			on_increase: onIncrease,
			on_decrease: onDecrease,
		};
	}

	let price: Price = {
		id: item.price_id || curPrice?.id || generateId("pr"),
		created_at: item.created_at || Date.now(),
		org_id: orgId,
		internal_product_id: internalProductId,
		is_custom: isCustom,
		config,
		entitlement_id: ent.id,
		proration_config: prorationConfig,
		tier_behaviour: item.tier_behaviour ?? null,
	};

	const billingType = getBillingType(price.config!);
	if (
		(billingType === BillingType.UsageInArrear ||
			billingType === BillingType.InArrearProrated) &&
		price.config!.interval === BillingInterval.OneOff
	) {
		throw new RecaseError({
			message: `Usage prices cannot be one-off if not set to prepaid (feature: ${item.feature_id})`,
			code: ErrCode.InvalidPrice,
			statusCode: 400,
		});
	}

	const priceOrEntDifferent =
		(curPrice && !pricesAreSame(curPrice, price, true)) ||
		(curEnt && !entsAreSame(curEnt, ent));

	if (curPrice && (priceOrEntDifferent || newVersion)) {
		const newConfig = price.config as UsagePriceConfig;
		const curConfig = curPrice.config as UsagePriceConfig;
		newConfig.stripe_meter_id = curConfig.stripe_meter_id;
		newConfig.stripe_product_id = curConfig.stripe_product_id;
		price.config = newConfig;
	}

	if (isCustom || newVersion) {
		price = {
			...price,
			id: generateId("pr"),
			created_at: Date.now(),
		};
	}

	return { price, ent };
};

export const itemToPriceAndEnt = ({
	item,
	orgId,
	internalProductId,
	feature,
	curPrice,
	curEnt,
	isCustom,
	newVersion,
	features,
}: {
	item: ProductItem;
	orgId: string;
	internalProductId: string;
	feature?: Feature;
	curPrice?: Price;
	curEnt?: Entitlement;
	isCustom: boolean;
	newVersion?: boolean;
	features: Feature[];
}) => {
	let newPrice: Price | null = null;
	let newEnt: Entitlement | null = null;

	let updatedPrice: Price | null = null;
	let updatedEnt: Entitlement | null = null;

	let samePrice: Price | null = null;
	let sameEnt: Entitlement | null = null;

	if (isPriceItem(item)) {
		const { price } = toPrice({
			item,
			orgId,
			internalProductId,
			isCustom,
			newVersion,
			curPrice,
		});

		if (!curPrice || newVersion) {
			newPrice = price;
		} else if (!pricesAreSame(curPrice, price, true)) {
			updatedPrice = price;
		} else {
			samePrice = curPrice;
		}
	} else if (isFeatureItem(item)) {
		if (!feature) {
			throw new RecaseError({
				message: `Feature ${item.feature_id} not found`,
				code: ErrCode.InvalidRequest,
			});
		}
		const isBoolean = feature?.type === FeatureType.Boolean;

		const { ent } = toFeature({
			item,
			orgId,
			internalFeatureId: feature!.internal_id!,
			internalProductId,
			isCustom,
			newVersion,
			feature,
			curEnt,
		});

		if (!curEnt || newVersion) {
			newEnt = ent;
		}

		// Boolean features can't be updated
		else if (!entsAreSame(curEnt, ent)) {
			updatedEnt = ent;
		} else {
			sameEnt = curEnt;
		}
	} else {
		if (!feature) {
			throw new RecaseError({
				message: `Feature ${item.feature_id} not found`,
				code: ErrCode.InvalidRequest,
			});
		}

		const { price, ent } = toFeatureAndPrice({
			item,
			orgId,
			internalFeatureId: feature!.internal_id!,
			internalProductId,
			isCustom,
			curPrice,
			curEnt,
			newVersion,
			features,
		});

		const entSame = curEnt && entsAreSame(curEnt, ent);

		// 1. If no curPrice, price is new
		if (!curPrice || newVersion) {
			newPrice = price;
		}

		// 2. If ent or price aren't same, price is updated
		else if (!entSame || !pricesAreSame(curPrice, price, false)) {
			updatedPrice = price;
		}

		// 3. price is same
		else {
			samePrice = curPrice;
		}

		// 1. If no curEnt, ent is new
		if (!curEnt || newVersion) {
			newEnt = ent;
		}

		// 2. If ent is different, ent is updated
		else if (!entSame) {
			updatedEnt = ent;
		}

		// 3. ent is same
		else {
			sameEnt = curEnt;
		}
	}

	return { newPrice, newEnt, updatedPrice, updatedEnt, samePrice, sameEnt };
};
