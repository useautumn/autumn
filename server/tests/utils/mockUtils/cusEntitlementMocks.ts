import { FeatureType, type FullCustomerEntitlement } from "@autumn/shared";
import { createMockEntitlement } from "./entitlementMocks";

export const createMockCusEntitlement = ({
	featureId,
	internalFeatureId,
	featureName,
	allowance,
	balance,
	featureType = FeatureType.Metered,
}: {
	featureId: string;
	internalFeatureId?: string;
	featureName: string;
	allowance: number;
	balance: number;
	featureType?: FeatureType;
}): FullCustomerEntitlement => ({
	id: `cus_ent_${featureId}`,
	internal_customer_id: "cus_internal",
	internal_feature_id: internalFeatureId ?? `internal_${featureId}`,
	customer_id: "cus_test",
	feature_id: featureId,
	customer_product_id: "cus_prod_test",
	entitlement_id: `ent_${featureId}`,
	created_at: Date.now(),
	unlimited: false,
	balance,
	additional_balance: 0,
	usage_allowed: true,
	next_reset_at: null,
	adjustment: 0,
	entities: null,
	entitlement: createMockEntitlement({
		featureId,
		internalFeatureId,
		featureName,
		allowance,
		featureType,
	}),
	replaceables: [],
	rollovers: [],
});
