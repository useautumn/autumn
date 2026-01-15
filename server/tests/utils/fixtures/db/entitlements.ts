import { AllowanceType, type EntInterval, FeatureType } from "@autumn/shared";
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
	interval = null,
	intervalCount = 1,
	entityFeatureId = null,
}: {
	id?: string;
	featureId: string;
	internalFeatureId?: string;
	featureName: string;
	allowance: number;
	featureType?: FeatureType;
	interval?: EntInterval | null;
	intervalCount?: number;
	entityFeatureId?: string | null;
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
	rollover: null,
	feature: features.create({
		id: featureId,
		internalId: internalFeatureId,
		name: featureName,
		type: featureType,
	}),
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const entitlements = {
	create,
} as const;
