import {
	type EntInterval,
	type EntityBalance,
	FeatureType,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { entitlements } from "./entitlements";

/**
 * Create a customer entitlement fixture
 */
const create = ({
	id,
	entitlementId,
	featureId,
	internalFeatureId,
	featureName,
	allowance,
	balance,
	customerProductId,
	featureType = FeatureType.Metered,
	interval = null,
	intervalCount = 1,
	usageAllowed = true,
	nextResetAt = null,
	entities = null,
	entityFeatureId = null,
}: {
	id?: string;
	entitlementId?: string;
	featureId: string;
	internalFeatureId?: string;
	featureName: string;
	allowance: number;
	balance: number;
	customerProductId?: string;
	featureType?: FeatureType;
	interval?: EntInterval | null;
	intervalCount?: number;
	usageAllowed?: boolean;
	nextResetAt?: number | null;
	entities?: Record<string, EntityBalance> | null;
	entityFeatureId?: string | null;
}): FullCustomerEntitlement => {
	const entId = entitlementId ?? `ent_${featureId}`;
	return {
		id: id ?? `cus_ent_${featureId}_${crypto.randomUUID().slice(0, 8)}`,
		internal_customer_id: "cus_internal",
		internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
		customer_id: "cus_test",
		feature_id: featureId,
		customer_product_id: customerProductId ?? "cus_prod_test",
		entitlement_id: entId,
		created_at: Date.now(),
		unlimited: false,
		balance,
		additional_balance: 0,
		usage_allowed: usageAllowed,
		next_reset_at: nextResetAt,
		adjustment: 0,
		entities,
		entitlement: entitlements.create({
			id: entId,
			featureId,
			internalFeatureId,
			featureName,
			allowance,
			featureType,
			interval,
			intervalCount,
			entityFeatureId,
		}),
		replaceables: [],
		rollovers: [],

		internal_entity_id: null,
		expires_at: null,
	};
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const customerEntitlements = {
	create,
} as const;
