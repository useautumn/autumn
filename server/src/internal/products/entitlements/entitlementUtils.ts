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
	type RolloverConfig,
	type UsagePriceConfig,
} from "@autumn/shared";
import RecaseError from "@server/utils/errorUtils";
import { addDays } from "date-fns";

export const entIntervalToTrialDuration = ({
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

export const trialToDays = (freeTrial: FreeTrial) => {
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

export const addTrialToNextResetAt = (
	nextResetAt: number,
	freeTrial: FreeTrial | null,
) => {
	if (!freeTrial) return nextResetAt;

	return addDays(new Date(nextResetAt), freeTrial.length).getTime();
};

export const rolloversAreSame = ({
	rollover1,
	rollover2,
}: {
	rollover1?: RolloverConfig | null;
	rollover2?: RolloverConfig | null;
}) => {
	if (!rollover1 && !rollover2) return true;
	if (!rollover1 && rollover2) return false;
	if (rollover1 && !rollover2) return false;

	return (
		rollover1!.max == rollover2!.max &&
		rollover1!.duration == rollover2!.duration &&
		rollover1!.length == rollover2!.length
	);
};

export const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
	// 1. Check if they have same internal_feature_id
	if (ent1.internal_feature_id !== ent2.internal_feature_id) {
		console.log(
			`Internal feature ID different: ${ent1.internal_feature_id} !== ${ent2.internal_feature_id}`,
		);
		return false;
	}

	// 2. Check if they have same allowance type
	if (ent1.allowance_type !== ent2.allowance_type) {
		console.log(
			`Allowance type different: ${ent1.allowance_type} !== ${ent2.allowance_type}`,
		);
		return false;
	}
	// 3. Check if they have same interval
	const diffs = {
		interval: {
			condition: ent1.interval != ent2.interval,
			message: `Interval different: ${ent1.interval} !== ${ent2.interval}`,
		},
		intervalCount: {
			condition: ent1.interval_count != ent2.interval_count,
			message: `Interval count different: ${ent1.interval_count} !== ${ent2.interval_count}`,
		},
		allowance: {
			condition:
				ent1.allowance_type !== AllowanceType.Unlimited &&
				ent1.allowance != ent2.allowance,
			message: `Allowance different: ${ent1.allowance} !== ${ent2.allowance}`,
		},
		carryFromPrevious: {
			condition: ent1.carry_from_previous != ent2.carry_from_previous,
			message: `Carry from previous different: ${ent1.carry_from_previous} !== ${ent2.carry_from_previous}`,
		},
		entityFeatureId: {
			condition: ent1.entity_feature_id !== ent2.entity_feature_id,
			message: `Entity feature ID different: ${ent1.entity_feature_id} !== ${ent2.entity_feature_id}`,
		},
		usageLimit: {
			condition: ent1.usage_limit != ent2.usage_limit,
			message: `Usage limit different: ${ent1.usage_limit} !== ${ent2.usage_limit}`,
		},

		rollover: {
			condition: !rolloversAreSame({
				rollover1: ent1.rollover,
				rollover2: ent2.rollover,
			}),
			message: `Rollover different: ${ent1.rollover} !== ${ent2.rollover}`,
		},
	};

	const entsAreDiff = Object.values(diffs).some((d) => d.condition);

	if (entsAreDiff) {
		console.log("Entitlements different");
		console.log(
			"Differences:",
			Object.values(diffs)
				.filter((d) => d.condition)
				.map((d) => d.message),
		);
	}
	return !entsAreDiff;
};

// OTHERS
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
