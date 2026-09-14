/** biome-ignore-all lint/suspicious/noDoubleEquals: legacy product comparison intentionally uses loose numeric/nullish equality */

import {
	AllowanceType,
	type CreditSchemaItem,
	creditDimensionRulesEqual,
	EntInterval,
	type Entitlement,
	type FeatureConfigOverride,
	type FeatureMarkupsOverride,
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

export const creditSchemaItemsAreSame = ({
	left,
	right,
}: {
	left: CreditSchemaItem;
	right: CreditSchemaItem;
}) =>
	(left.feature_amount ?? 1) == (right.feature_amount ?? 1) &&
	creditDimensionRulesEqual({ left, right }) &&
	left.credit_amount == right.credit_amount &&
	(left.tier_behavior ?? null) === (right.tier_behavior ?? null) &&
	(left.tiers ?? []).length === (right.tiers ?? []).length &&
	(left.tiers ?? []).every(
		(tier, tierIndex) =>
			tier.to === right.tiers?.[tierIndex]?.to &&
			tier.credit_amount == right.tiers?.[tierIndex]?.credit_amount,
	);

/** Entries are keyed by metered_feature_id (rate lookup is a find over the
 * array), so ordering is not semantic — compare as a keyed set. */
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

	return schema1.every((item1) => {
		const item2 = schema2.find(
			(candidate) => candidate.metered_feature_id === item1.metered_feature_id,
		);
		if (!item2) return false;
		return creditSchemaItemsAreSame({ left: item1, right: item2 });
	});
};

type MarkupEntry = Record<string, number | null | undefined>;
const MARKUP_FIELDS = ["markup", "input_cost", "output_cost"] as const;

const markupRecordsAreSame = (
	left: Record<string, MarkupEntry> | null | undefined,
	right: Record<string, MarkupEntry> | null | undefined,
) =>
	[...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].every(
		(key) =>
			MARKUP_FIELDS.every(
				(field) =>
					(left?.[key]?.[field] ?? null) === (right?.[key]?.[field] ?? null),
			),
	);

const markupOverridesAreSame = ({
	markups1,
	markups2,
}: {
	markups1?: FeatureMarkupsOverride | null;
	markups2?: FeatureMarkupsOverride | null;
}) => {
	if (!(markups1 && markups2)) return !(markups1 || markups2);

	return (
		(markups1.default_markup ?? null) === (markups2.default_markup ?? null) &&
		markupRecordsAreSame(
			markups1.provider_markups,
			markups2.provider_markups,
		) &&
		markupRecordsAreSame(markups1.model_markups, markups2.model_markups)
	);
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
	}) &&
	markupOverridesAreSame({
		markups1: override1?.markups,
		markups2: override2?.markups,
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

const expiriesAreSame = (ent1: Entitlement, ent2: Entitlement) =>
	(ent1.expiry_duration ?? null) === (ent2.expiry_duration ?? null) &&
	(ent1.expiry_length ?? null) == (ent2.expiry_length ?? null);

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
		expiry: !expiriesAreSame(ent1, ent2),
	};

	return !Object.values(diffs).some(Boolean);
};
