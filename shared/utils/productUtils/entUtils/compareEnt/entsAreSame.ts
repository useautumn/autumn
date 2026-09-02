/** biome-ignore-all lint/suspicious/noDoubleEquals: legacy product comparison intentionally uses loose numeric/nullish equality */

import {
	AllowanceType,
	type CreditSchemaItem,
	EntInterval,
	type Entitlement,
	type FeatureConfigOverride,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";

const rolloversAreSame = ({
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
		rollover1?.max == rollover2?.max &&
		rollover1?.max_percentage == rollover2?.max_percentage &&
		(rollover1?.duration ?? RolloverExpiryDurationType.Month) ===
			(rollover2?.duration ?? RolloverExpiryDurationType.Month) &&
		rollover1?.length == rollover2?.length
	);
};

const creditSchemasAreSame = ({
	schema1,
	schema2,
}: {
	schema1?: CreditSchemaItem[] | null;
	schema2?: CreditSchemaItem[] | null;
}) => {
	if (!schema1 && !schema2) return true;
	if (!schema1 || !schema2) return false;
	if (schema1.length !== schema2.length) return false;

	return schema1.every((item1, index) => {
		const item2 = schema2[index];
		return (
			item1.metered_feature_id === item2.metered_feature_id &&
			(item1.feature_amount ?? 1) == (item2.feature_amount ?? 1) &&
			item1.credit_amount == item2.credit_amount &&
			(item1.tier_behavior ?? null) === (item2.tier_behavior ?? null) &&
			(item1.tiers ?? []).length === (item2.tiers ?? []).length &&
			(item1.tiers ?? []).every(
				(tier1, tierIndex) =>
					tier1.to === item2.tiers?.[tierIndex]?.to &&
					tier1.credit_amount == item2.tiers?.[tierIndex]?.credit_amount,
			)
		);
	});
};

/** Field-by-field so new override keys must be added here deliberately. */
export const featureOverridesAreSame = ({
	override1,
	override2,
}: {
	override1?: FeatureConfigOverride | null;
	override2?: FeatureConfigOverride | null;
}) =>
	creditSchemasAreSame({
		schema1: override1?.schema,
		schema2: override2?.schema,
	});

const normalizeOptionalId = (value?: string | null) => value || null;

/** Unset interval means lifetime, matching isLifetimeEntitlement. */
export const normalizedEntitlementInterval = (entitlement: Entitlement) =>
	entitlement.interval ?? EntInterval.Lifetime;

/** Interval count defaults to 1 and is meaningless for lifetime entitlements. */
export const normalizedEntitlementIntervalCount = (entitlement: Entitlement) =>
	normalizedEntitlementInterval(entitlement) === EntInterval.Lifetime
		? 1
		: (entitlement.interval_count ?? 1);

const hasUnlimitedAllowanceType = (entitlement: Entitlement) =>
	entitlement.allowance_type === AllowanceType.Unlimited;

export const entsAreSame = (ent1: Entitlement, ent2: Entitlement) => {
	if (ent1.internal_feature_id !== ent2.internal_feature_id) return false;
	// Unlimited-ness is the semantic boundary (matches isUnlimitedEntitlement);
	// fixed/none/unset distinctions fall to the allowance comparison below.
	if (hasUnlimitedAllowanceType(ent1) !== hasUnlimitedAllowanceType(ent2)) {
		return false;
	}

	const bothUnlimited = hasUnlimitedAllowanceType(ent1);

	const diffs = {
		interval:
			normalizedEntitlementInterval(ent1) !==
			normalizedEntitlementInterval(ent2),
		intervalCount:
			normalizedEntitlementIntervalCount(ent1) !==
			normalizedEntitlementIntervalCount(ent2),
		allowance: !bothUnlimited && ent1.allowance != ent2.allowance,
		carryFromPrevious:
			(ent1.carry_from_previous ?? false) !==
			(ent2.carry_from_previous ?? false),
		entityFeatureId:
			normalizeOptionalId(ent1.entity_feature_id) !==
			normalizeOptionalId(ent2.entity_feature_id),
		pooled: (ent1.pooled ?? false) !== (ent2.pooled ?? false),
		usageLimit: ent1.usage_limit != ent2.usage_limit,
		rollover: !rolloversAreSame({
			rollover1: ent1.rollover,
			rollover2: ent2.rollover,
		}),
		featureOverride: !featureOverridesAreSame({
			override1: ent1.feature_override,
			override2: ent2.feature_override,
		}),
	};

	return !Object.values(diffs).some(Boolean);
};
