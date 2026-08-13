import {
	AllowanceType,
	EntInterval,
	type Entitlement,
	type EntitlementPrice,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
	type ModelMarkups,
	type Price,
	type RolloverConfig,
} from "@autumn/shared";
import { features } from "./features";

/**
 * Create an entitlement fixture
 */
const create = ({
	id,
	featureId,
	internalFeatureId,
	featureName,
	allowance,
	featureType = FeatureType.Metered,
	featureConfig = {},
	interval = null,
	intervalCount = 1,
	entityFeatureId = null,
	rollover = null,
	modelMarkups = null,
}: {
	id?: string;
	featureId: string;
	internalFeatureId?: string;
	featureName: string;
	allowance: number;
	featureType?: FeatureType;
	featureConfig?: Record<string, unknown>;
	interval?: EntInterval | null;
	intervalCount?: number;
	entityFeatureId?: string | null;
	rollover?: RolloverConfig | null;
	modelMarkups?: ModelMarkups;
}) => ({
	id: id ?? `ent_${featureId}_${crypto.randomUUID().slice(0, 8)}`,
	created_at: Date.now(),
	internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
	internal_product_id: "prod_internal",
	is_custom: false,
	allowance_type: AllowanceType.Fixed,
	allowance,
	interval,
	interval_count: intervalCount,
	carry_from_previous: false,
	entity_feature_id: entityFeatureId,
	feature_id: featureId,
	usage_limit: null,
	rollover,
	feature: features.create({
		id: featureId,
		internalId: internalFeatureId,
		name: featureName,
		type: featureType,
		config: featureConfig,
		modelMarkups: modelMarkups ?? null,
	}),
});

const defaultMessagesFeature = () =>
	features.create({
		id: "messages",
		internalId: "feat_internal_messages",
		name: "Messages",
		config: { usage_type: FeatureUsageType.Single },
	});

/** Stable-id entitlement for field-level comparison tests. */
const build = (overrides: Partial<Entitlement> = {}): Entitlement => {
	const feature = defaultMessagesFeature();
	return {
		id: "ent_1",
		created_at: 1_800_000_000_000,
		internal_feature_id: feature.internal_id,
		internal_product_id: "prod_internal",
		is_custom: false,
		allowance_type: AllowanceType.Fixed,
		allowance: 100,
		interval: EntInterval.Month,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		pooled: false,
		org_id: "org_test",
		feature_id: feature.id,
		usage_limit: null,
		rollover: null,
		...overrides,
	};
};

/** Stable-id entitlement with joined feature. */
const buildWithFeature = (
	overrides: Partial<EntitlementWithFeature> = {},
): EntitlementWithFeature => {
	const { feature: featureOverride, ...rest } = overrides;
	const feature = featureOverride ?? defaultMessagesFeature();
	return {
		...build(),
		...rest,
		feature,
	};
};

/** Entitlement + optional price pair. */
const buildPricePair = ({
	entitlement = buildWithFeature(),
	price,
}: {
	entitlement?: EntitlementWithFeature;
	price?: Price;
} = {}): EntitlementPrice => ({ entitlement, price });

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const entitlements = {
	create,
	build,
	buildWithFeature,
	buildPricePair,
} as const;
