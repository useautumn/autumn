import { InternalError } from "@api/errors/base/InternalError";
import { BillingMethod } from "@api/products/components/billingMethod";
import type { Feature } from "@models/featureModels/featureModels";
import type { EntitlementWithFeature } from "@models/productModels/entModels/entModels";
import { FixedPriceConfigSchema } from "@models/productModels/priceModels/priceConfig/fixedPriceConfig";
import {
	type PriceCurrencyConfig,
	type UsagePriceConfig,
	UsagePriceConfigSchema,
	type UsageTier,
} from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import {
	BillingType,
	PriceType,
} from "@models/productModels/priceModels/priceEnums";
import type { Price } from "@models/productModels/priceModels/priceModels";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import {
	shouldBillNow,
	shouldCreateReplaceables,
	shouldProrate,
	shouldSkipLineItems,
} from "@utils/billingUtils";
import { priceToEnt } from "@utils/productUtils/convertProductUtils";
import { getBillingType } from "@utils/productUtils/priceUtils";

// Overload: errorOnNotFound = true → guaranteed Feature
export function priceToFeature(params: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound: true;
}): Feature;

// Overload: errorOnNotFound = false/undefined → Feature | undefined
export function priceToFeature(params: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound?: false;
}): Feature | undefined;

// Implementation
export function priceToFeature({
	price,
	ents,
	features,
	errorOnNotFound,
}: {
	price: Price;
	ents?: EntitlementWithFeature[];
	features?: Feature[];
	errorOnNotFound?: boolean;
}): Feature | undefined {
	if (!features && !ents) {
		throw new Error("priceToFeature requires either ents or features as arg");
	}

	let result: Feature | undefined;

	if (features) {
		result = features.find(
			(f) =>
				f.internal_id ===
				(price.config as UsagePriceConfig).internal_feature_id,
		);
	} else {
		const ent = priceToEnt({ price, entitlements: ents ?? [] });
		result = ent?.feature;
	}

	if (errorOnNotFound && !result) {
		throw new InternalError({
			message: `Feature not found for price ${price.id}`,
		});
	}

	return result;
}

export const priceToProrationConfig = ({
	price,
	isUpgrade,
}: {
	price: Price;
	isUpgrade: boolean;
}): {
	prorationBehaviorConfig: OnIncrease | OnDecrease;
	shouldApplyProration: boolean;
	chargeImmediately: boolean;
	skipLineItems: boolean;
	shouldCreateReplaceables: boolean;
} => {
	const prorationBehaviorConfig = isUpgrade
		? (price.proration_config?.on_increase ?? OnIncrease.ProrateImmediately)
		: (price.proration_config?.on_decrease ?? OnDecrease.ProrateImmediately);

	return {
		prorationBehaviorConfig,
		shouldApplyProration: shouldProrate(prorationBehaviorConfig),
		chargeImmediately: shouldBillNow(prorationBehaviorConfig),
		skipLineItems: shouldSkipLineItems(prorationBehaviorConfig),
		shouldCreateReplaceables: shouldCreateReplaceables(prorationBehaviorConfig),
	};
};

export const priceToBillingMethod = ({
	price,
}: {
	price?: Price;
}): BillingMethod | undefined => {
	if (!price) return undefined;

	const billingType = getBillingType(price.config);
	if (billingType === BillingType.UsageInAdvance) return BillingMethod.Prepaid;
	if (
		billingType === BillingType.UsageInArrear ||
		billingType === BillingType.InArrearProrated
	)
		return BillingMethod.UsageBased;

	return undefined;
};

export enum PriceSignaturePrecision {
	/** Every field pricesAreSame compares — same signature ⇔ same definition. */
	Definition = "definition",
	/** Feature, derived billing type, and billing cadence (findPriceSuccessor's key). */
	BillingIdentity = "billing_identity",
}

// The final tier's `to` is ignored, mirroring tiersAreSame: "inf" and -1
// both mean "no upper bound".
const tiersToSignature = (tiers?: UsageTier[] | null) =>
	(tiers ?? []).map((tier, index, allTiers) => [
		index === allTiers.length - 1 ? null : tier.to,
		tier.amount,
		tier.flat_amount ?? 0,
	]);

const currenciesToSignature = (
	currencies?: Record<string, PriceCurrencyConfig> | null,
) =>
	Object.keys(currencies ?? {})
		.sort()
		.map((currencyCode) => [
			currencyCode,
			currencies?.[currencyCode]?.amount ?? null,
			tiersToSignature(currencies?.[currencyCode]?.usage_tiers),
		]);

const priceToDefinitionSignature = ({ price }: { price: Price }): string => {
	if (price.config.type === PriceType.Fixed) {
		const config = FixedPriceConfigSchema.parse(price.config);
		return JSON.stringify({
			type: config.type,
			amount: config.amount,
			interval: config.interval,
			interval_count: config.interval_count ?? null,
			base_currency: config.base_currency ?? null,
			currencies: currenciesToSignature(config.currencies),
		});
	}

	const config = UsagePriceConfigSchema.parse(price.config);
	return JSON.stringify({
		type: config.type,
		bill_when: config.bill_when,
		billing_units: config.billing_units ?? null,
		should_prorate: config.should_prorate ?? null,
		allocated_billing_behavior: config.allocated_billing_behavior ?? null,
		interval: config.interval,
		interval_count: config.interval_count ?? null,
		feature_id: config.feature_id,
		internal_feature_id: config.internal_feature_id,
		usage_tiers: tiersToSignature(config.usage_tiers),
		base_currency: config.base_currency ?? null,
		currencies: currenciesToSignature(config.currencies),
		on_increase: price.proration_config?.on_increase ?? null,
		on_decrease: price.proration_config?.on_decrease ?? null,
		tier_behavior: price.tier_behavior ?? null,
	});
};

const priceToBillingIdentitySignature = ({ price }: { price: Price }): string =>
	JSON.stringify({
		feature_id: price.config.feature_id ?? null,
		billing_type: getBillingType(price.config),
		interval: price.config.interval ?? null,
		interval_count: price.config.interval
			? (price.config.interval_count ?? 1)
			: null,
	});

/** Deterministic, field-by-field encoding of a price definition. */
export const priceToSignature = ({
	price,
	precision,
}: {
	price: Price;
	precision: PriceSignaturePrecision;
}): string =>
	precision === PriceSignaturePrecision.Definition
		? priceToDefinitionSignature({ price })
		: priceToBillingIdentitySignature({ price });
