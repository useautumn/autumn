import {
	AllowanceType,
	type FullCusProduct,
	type FullCustomerEntitlement,
	isBooleanEntitlement,
	type PooledBalanceIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import type { MutablePooledCustomerEntitlement } from "../types/pooledBalanceComputeTypes";

const getPooledEntitlementConfig = ({
	isBoolean,
	unlimited,
	rollover,
}: {
	isBoolean: boolean;
	unlimited: boolean;
	rollover: FullCustomerEntitlement["entitlement"]["rollover"];
}) => {
	if (isBoolean) {
		return { allowance: null, allowance_type: null, rollover: null };
	}
	if (unlimited) {
		return {
			allowance: null,
			allowance_type: AllowanceType.Unlimited,
			rollover: null,
		};
	}
	return { allowance: 0, allowance_type: AllowanceType.Fixed, rollover };
};

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
	const pooledBalanceId = generateId("pool");
	const isBoolean = isBooleanEntitlement({
		entitlement: contributionCustomerEntitlement.entitlement,
	});
	const pooledEntitlementConfig = getPooledEntitlementConfig({
		isBoolean,
		unlimited: identity.unlimited,
		rollover: contributionCustomerEntitlement.entitlement.rollover,
	});
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
			...pooledEntitlementConfig,
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
		// Pools reset through the lazy/cron paths regardless of mode; the batch
		// scan must keep seeing them, so never stamp reset_by_invoice.
		reset_by_invoice: false,
		is_pooled_balance: true,
		pooled_balance_id: pooledBalanceId,
		pooled_contribution_id: null,
		replaceables: [],
		rollovers: [],
		pooled_balance_contribution: undefined,
		pooled_balance: {
			id: pooledBalanceId,
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: customerProduct.internal_customer_id,
			internal_feature_id: identity.internalFeatureId,
			unlimited: identity.unlimited,
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
			expires_at: null,
			created_at: now,
			updated_at: now,
		},
	};
};
