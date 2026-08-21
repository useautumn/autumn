/** biome-ignore-all lint/suspicious/noDoubleEquals: != allowed for comparison... */

import {
	AllowanceType,
	EntInterval,
	type Entitlement,
	type EntitlementWithFeature,
	ErrCode,
	type Feature,
	FeatureType,
	type FreeTrial,
	FreeTrialDuration,
	type FullEntitlement,
	type FullProduct,
	type Price,
	PriceType,
	type UsagePriceConfig,
} from "@autumn/shared";
import RecaseError from "@server/utils/errorUtils";

const entIntervalToTrialDuration = ({
	interval,
	intervalCount,
}: {
	interval: EntInterval;
	intervalCount: number;
}) => {
	switch (interval) {
		case EntInterval.Day:
			return intervalCount;
		case EntInterval.Week:
			return intervalCount * 7;
		case EntInterval.Month:
			return intervalCount * 30;
		case EntInterval.Quarter:
			return intervalCount * 90;
		case EntInterval.SemiAnnual:
			return intervalCount * 180;
		case EntInterval.Year:
			return intervalCount * 365;
		case EntInterval.Lifetime:
			return intervalCount * 1000;
	}
};

const trialToDays = (freeTrial: FreeTrial) => {
	let days: number;
	switch (freeTrial.duration) {
		case FreeTrialDuration.Day:
			days = freeTrial.length;
			break;
		case FreeTrialDuration.Month:
			days = freeTrial.length * 30;
			break;
		case FreeTrialDuration.Year:
			days = freeTrial.length * 365;
			break;
	}
	return days;
};

export const applyTrialToEntitlement = (
	entitlement: EntitlementWithFeature,
	freeTrial: FreeTrial | null,
) => {
	if (!freeTrial) return false;

	if (entitlement.feature.type === FeatureType.Boolean) return false;
	if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
		return false;
	if (entitlement.allowance_type === AllowanceType.Unlimited) return false;

	const trialDays = trialToDays(freeTrial);
	const entDays = entIntervalToTrialDuration({
		interval: entitlement.interval!,
		intervalCount: entitlement.interval_count || 1,
	});

	if (entDays && trialDays < entDays) {
		return true;
	}

	return false;
};

export const getEntRelatedPrice = (
	entitlement: Entitlement,
	prices: Price[],
	allowFeatureMatch = false,
) => {
	return prices.find((price) => {
		if (price.config?.type === PriceType.Fixed) {
			return false;
		}

		const config = price.config as UsagePriceConfig;

		if (allowFeatureMatch) {
			return entitlement.internal_feature_id == config.internal_feature_id;
		}

		const entIdMatch = entitlement.id == price.entitlement_id;
		const productIdMatch =
			entitlement.internal_product_id == price.internal_product_id;
		return entIdMatch && productIdMatch;
	});
};

export const getEntitlementsForProduct = (
	product: FullProduct,
	entitlements: EntitlementWithFeature[],
) => {
	return entitlements.filter(
		(ent) => ent.internal_product_id === product.internal_id,
	);
};

export const getEntsWithFeature = ({
	ents,
	features,
}: {
	ents: Entitlement[];
	features: Feature[];
}) => {
	return ents.map((ent) => {
		const feature = features.find(
			(f) => f.internal_id === ent.internal_feature_id,
		);
		if (!feature) {
			throw new RecaseError({
				message: `Couldn't find feature ${ent.internal_feature_id} for entitlement ${ent.id}`,
				code: ErrCode.FeatureNotFound,
			});
		}

		return {
			...ent,
			feature,
		};
	}) as FullEntitlement[];
};
