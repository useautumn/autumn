import {
	type EntitlementWithFeature,
	type FullCusProduct,
	type FullCustomerLicense,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
	type PooledBalanceIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import { initPooledBalanceGraph } from "../applyIncomingPooledBalanceSources/initPooledBalanceGraph";
import type { MutablePooledCustomerEntitlement } from "../types/pooledBalanceComputeTypes";

/** Catalog entitlement as a synthetic source so we can mint without a seat CP. */
export const initLicensePooledBalanceGraph = ({
	ctx,
	customerLicense,
	entitlement,
	identity,
	granted,
	nextResetAt,
	now,
}: {
	ctx: AutumnContext;
	customerLicense: FullCustomerLicense;
	entitlement: EntitlementWithFeature;
	identity: PooledBalanceIdentity;
	granted: number;
	nextResetAt: number | null;
	now: number;
}): MutablePooledCustomerEntitlement => {
	const isBoolean = isBooleanEntitlement({ entitlement });
	const unlimited = isUnlimitedEntitlement({ entitlement });
	const placeholderCustomerEntitlement = {
		id: generateId("cus_ent"),
		internal_customer_id: customerLicense.internal_customer_id,
		internal_entity_id: null,
		internal_feature_id: entitlement.internal_feature_id,
		customer_id: null,
		feature_id: entitlement.feature.id,
		customer_product_id: null,
		entitlement_id: entitlement.id,
		created_at: now,
		unlimited: isBoolean ? null : unlimited,
		balance: 0,
		additional_balance: 0,
		usage_allowed: false,
		separate_interval: false,
		is_pooled_balance: false,
		pooled_balance_id: null,
		pooled_contribution_id: null,
		reset_cycle_anchor: identity.resetCycleAnchor,
		next_reset_at: nextResetAt,
		adjustment: 0,
		expires_at: null,
		cache_version: 0,
		entities: null,
		external_id: null,
		entitlement,
		replaceables: [],
		rollovers: [],
	};

	return initPooledBalanceGraph({
		ctx,
		contributionCustomerEntitlement: placeholderCustomerEntitlement,
		customerProduct: {
			internal_customer_id: customerLicense.internal_customer_id,
		} as FullCusProduct,
		identity,
		balanceDelta: granted,
		granted,
		nextResetAt,
		now,
	});
};
