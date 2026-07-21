import type {
	FullCusProduct,
	FullCustomerEntitlement,
	PooledBalanceIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import type { MutablePooledCustomerEntitlement } from "../types/pooledBalanceComputeTypes";

export const initPooledBalanceGraph = ({
	ctx,
	contributionCustomerEntitlement,
	customerProduct,
	identity,
	balanceDelta,
	granted,
	nextResetAt,
	now,
}: {
	ctx: AutumnContext;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	identity: PooledBalanceIdentity;
	balanceDelta: number;
	granted: number;
	nextResetAt: number | null;
	now: number;
}): MutablePooledCustomerEntitlement => {
	const entitlementId = generateId("ent");
	const customerEntitlementId = generateId("cus_ent");

	return {
		...structuredClone(contributionCustomerEntitlement),
		id: customerEntitlementId,
		entitlement_id: entitlementId,
		entitlement: {
			...structuredClone(contributionCustomerEntitlement.entitlement),
			id: entitlementId,
			created_at: now,
			internal_product_id: null,
			internal_reward_id: null,
			is_custom: true,
			allowance: 0,
			org_id: ctx.org.id,
			feature_id: contributionCustomerEntitlement.entitlement.feature.id,
			pooled: true,
		},
		customer_product_id: null,
		internal_entity_id: null,
		created_at: now,
		balance: balanceDelta,
		adjustment: 0,
		additional_balance: 0,
		entities: null,
		reset_cycle_anchor: identity.resetCycleAnchor,
		next_reset_at: nextResetAt,
		cache_version: 0,
		external_id: null,
		is_pooled_balance: true,
		replaceables: [],
		rollovers: [],
		pooled_balance_contribution: undefined,
		pooled_balance: {
			id: generateId("pool"),
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: customerProduct.internal_customer_id,
			internal_feature_id: identity.internalFeatureId,
			granted,
			interval: identity.interval,
			interval_count: identity.intervalCount,
			reset_cycle_anchor: identity.resetCycleAnchor,
			reset_mode: identity.resetMode,
			stripe_subscription_id: identity.stripeSubscriptionId,
			customer_license_link_id: identity.customerLicenseLinkId,
			rollover_signature: identity.rolloverSignature,
			customer_entitlement_id: customerEntitlementId,
			last_applied_reset_at: null,
			created_at: now,
			updated_at: now,
		},
	};
};
