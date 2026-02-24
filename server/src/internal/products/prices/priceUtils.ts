import {
	BillingInterval,
	BillingType,
	BillWhen,
	type Entitlement,
	type EntitlementWithFeature,
	ErrCode,
	type FeatureOptions,
	type FixedPriceConfig,
	type FullProduct,
	OnDecrease,
	OnIncrease,
	type Price,
	PriceType,
	type Product,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import RecaseError from "@server/utils/errorUtils.js";
import {
	compareObjects,
	generateId,
	notNullish,
} from "@server/utils/genUtils.js";
import { Decimal } from "decimal.js";
import { StatusCodes } from "http-status-codes";
import { compareBillingIntervals } from "./priceUtils/priceIntervalUtils.js";

export { getPriceForOverage } from "@autumn/shared";

export const constructPrice = ({
	internalProductId,
	entitlementId,
	orgId,
	fixedConfig,
	usageConfig,
	isCustom,
}: {
	internalProductId: string;
	isCustom: boolean;
	orgId: string;
	entitlementId?: string;
	fixedConfig?: FixedPriceConfig;
	usageConfig?: UsagePriceConfig;
}) => {
	if (!usageConfig && !fixedConfig) {
		throw new RecaseError({
			message: "Usage config or fixed config must be provided",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const newPrice: Price = {
		id: generateId("pr"),
		org_id: orgId,
		internal_product_id: internalProductId,
		created_at: Date.now(),
		is_custom: isCustom,
		config: (usageConfig || fixedConfig)!,
		entitlement_id: entitlementId,
		proration_config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	};

	return newPrice;
};

export const getBillingType = (config: FixedPriceConfig | UsagePriceConfig) => {
	// 1. Fixed cycle / one off
	if (
		config.type === PriceType.Fixed &&
		config.interval === BillingInterval.OneOff
	) {
		return BillingType.OneOff;
	} else if (config.type === PriceType.Fixed) {
		return BillingType.FixedCycle;
	}

	// 2. Prepaid

	const usageConfig = config as UsagePriceConfig;
	if (
		usageConfig.bill_when === BillWhen.InAdvance ||
		usageConfig.bill_when === BillWhen.StartOfPeriod
	) {
		return BillingType.UsageInAdvance;
	} else if (usageConfig.bill_when === BillWhen.EndOfPeriod) {
		if (usageConfig.should_prorate) {
			return BillingType.InArrearProrated;
		}
		return BillingType.UsageInArrear;
	}

	return BillingType.UsageInArrear;
};

export const getBillingInterval = (prices: Price[]) => {
	if (prices.length === 0) {
		return {
			interval: BillingInterval.OneOff,
			intervalCount: 1,
		};
	}

	const pricesCopy = structuredClone(prices);

	try {
		pricesCopy.sort((a, b) => {
			return compareBillingIntervals({
				configA: {
					interval: a.config!.interval as BillingInterval,
					intervalCount: a.config!.interval_count || 1,
				},
				configB: {
					interval: b.config!.interval as BillingInterval,
					intervalCount: b.config!.interval_count || 1,
				},
			});
			// return (
			//   BillingIntervalOrder.indexOf(b.config!.interval!) -
			//   BillingIntervalOrder.indexOf(a.config!.interval!)
			// );
		});
	} catch (error) {
		console.log("Error sorting prices:", error);
		throw error;
	}

	// console.log(
	//   "pricesCopy",
	//   pricesCopy.map((p) => ({
	//     interval: p.config!.interval,
	//     intervalCount: p.config!.interval_count,
	//   }))
	// );

	if (pricesCopy.length === 0) {
		throw new RecaseError({
			message: "No prices found, can't get billing interval",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return {
		interval: pricesCopy[0].config!.interval as BillingInterval,
		intervalCount: pricesCopy[0].config!.interval_count || 1,
	};
	// return pricesCopy[pricesCopy.length - 1].config!.interval as BillingInterval;
};

export const pricesOnlyOneOff = (prices: Price[]) => {
	if (prices.length === 0) return false;

	return prices.every((price) => {
		const interval = price.config?.interval;

		if (!interval || interval !== BillingInterval.OneOff) {
			return false;
		}
		return true;
	});
};

export const pricesContainRecurring = (prices: Price[]) => {
	// TODO: Look into this...
	return prices.some((price) => {
		const interval = price.config?.interval;

		if (interval && interval !== BillingInterval.OneOff) {
			return true;
		}

		return false;
	});
};

// Get price options
export const getEntOptions = (
	optionsList: FeatureOptions[] | null | undefined,
	entitlement: Entitlement | EntitlementWithFeature,
) => {
	if (!entitlement || !optionsList || !Array.isArray(optionsList)) {
		return null;
	}
	const options = optionsList.find(
		(options) =>
			options.internal_feature_id === entitlement.internal_feature_id,
	);
	return options;
};

export const getPriceEntitlement = (
	price: Price,
	entitlements: EntitlementWithFeature[],
	allowFeatureMatch = false,
) => {
	const config = price.config as UsagePriceConfig;

	const entitlement = entitlements.find((ent) => {
		const entIdMatch =
			notNullish(price.entitlement_id) && price.entitlement_id === ent.id;

		const featureIdMatch =
			notNullish(config.internal_feature_id) &&
			config.internal_feature_id === ent.internal_feature_id;

		const productIdMatch =
			ent.internal_product_id === price.internal_product_id;

		if (allowFeatureMatch) {
			return (entIdMatch || featureIdMatch) && productIdMatch;
		}

		return entIdMatch && productIdMatch;
	});

	return entitlement as EntitlementWithFeature;
};

export const getPriceOptions = (
	price: Price,
	optionsList: FeatureOptions[],
) => {
	const config = price.config as UsagePriceConfig;

	const options = optionsList.find(
		(options) => options.internal_feature_id === config.internal_feature_id,
	);

	return options;
};

const pricesAreSame = (price1: Price, price2: Price) => {
	for (const key in price1.config) {
		const originalValue = (price1.config as any)[key];
		const newValue = (price2.config as any)[key];

		if (key === "usage_tiers") {
			for (let i = 0; i < originalValue.length; i++) {
				const originalTier = originalValue[i];
				const newTier = newValue[i];
				if (!compareObjects(originalTier, newTier)) {
					return false;
				}
			}
		} else if (originalValue !== newValue) {
			return false;
		}
	}

	return true;
};

const getUsageTier = (price: Price, quantity: number) => {
	const usageConfig = price.config as UsagePriceConfig;
	for (let i = 0; i < usageConfig.usage_tiers.length; i++) {
		if (i === usageConfig.usage_tiers.length - 1) {
			return usageConfig.usage_tiers[i];
		}

		const tier = usageConfig.usage_tiers[i];
		if (tier.to === TierInfinite || tier.to >= quantity) {
			return tier;
		}
	}
	return usageConfig.usage_tiers[0];
};

const priceToEventName = (productName: string, featureName: string) => {
	return `${productName} - ${featureName}`;
};

const roundPriceAmounts = (price: Price) => {
	if (price.config!.type === PriceType.Fixed) {
		const config = price.config as FixedPriceConfig;
		config.amount = Number(config.amount.toFixed(10));
		price.config = config;
	} else if (price.config!.type === PriceType.Usage) {
		const config = price.config as UsagePriceConfig;
		for (let i = 0; i < config.usage_tiers.length; i++) {
			config.usage_tiers[i].amount = Number(
				config.usage_tiers[i].amount.toFixed(10),
			);
		}

		price.config = config;
	}
};

export const priceIsOneOffAndTiered = (
	price: Price,
	relatedEnt: EntitlementWithFeature,
) => {
	const config = price.config as UsagePriceConfig;
	if (config.type === PriceType.Fixed) {
		return false;
	}

	return (
		config.interval === BillingInterval.OneOff && config.usage_tiers.length > 1
	);
};

export const getProductForPrice = (price: Price, products: FullProduct[]) => {
	return products.find(
		(product) => product.internal_id === price.internal_product_id,
	);
};

// Price to price / tiers
const priceToAmountOrTiers = (price: Price) => {
	if (price.config!.type === PriceType.Fixed) {
		const config = price.config as FixedPriceConfig;
		return {
			price: config.amount,
		};
	} else {
		const config = price.config as UsagePriceConfig;
		if (config.usage_tiers.length > 1) {
			return {
				tiers: config.usage_tiers,
			};
		} else {
			return {
				price: config.usage_tiers[0].amount,
			};
		}
	}
};

const roundUsage = ({
	usage,
	billingUnits,
}: {
	usage: number;
	billingUnits: number;
}) => {
	if (!billingUnits || billingUnits === 1) {
		return usage;
	}

	return new Decimal(usage)
		.div(billingUnits)
		.ceil()
		.mul(billingUnits)
		.toNumber();
};

export const formatPrice = ({
	price,
	product,
}: {
	price: Price;
	product?: Product;
}) => {
	if (price.config.type === PriceType.Fixed) {
		const config = price.config as FixedPriceConfig;
		const formatted = `${config.amount}${config.interval === BillingInterval.OneOff ? "(one off)" : `/ ${config.interval}`}`;
		if (product) {
			return `${product.name} - ${formatted}`;
		}
		return formatted;
	} else {
		const config = price.config as UsagePriceConfig;
		const billingType = getBillingType(config);
		const formatBillingType = {
			[BillingType.UsageInAdvance]: "prepaid",
			[BillingType.UsageInArrear]: "usage",
			[BillingType.InArrearProrated]: "cont_use",
			[BillingType.FixedCycle]: "cont_use",
		};

		const featureId = config.feature_id;

		const formatted = `${formatBillingType[billingType as keyof typeof formatBillingType]} price for feature ${featureId}: $${config.usage_tiers[0].amount}${config.billing_units ? ` ${config.billing_units}` : ""}`;
		if (product) {
			return `${product.name} - ${formatted}`;
		}
		return formatted;
	}
};
