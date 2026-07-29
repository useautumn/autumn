import {
	type CustomerEntitlement,
	type EntitlementWithFeature,
	entitlementAndPriceHaveSeparateInterval,
	entToPrice,
	type InitCustomerEntitlementContext,
	type InitFullCustomerProductOptions,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { entitlementToResetCycleAnchor } from "../cycleAnchorUtils";
import { initCustomerEntitlementBalance } from "./initCustomerEntitlementBalance";
import { initCustomerEntitlementNextResetAt } from "./initCustomerEntitlementNextResetAt";
import { initCustomerEntitlementUsageAllowed } from "./initCustomerEntitlementUsageAllowed";

export type InitCustomerEntitlementFields = Omit<
	CustomerEntitlement,
	"id" | "customer_product_id"
>;

export const initCustomerEntitlementFields = ({
	initContext,
	initOptions,
	entitlement,
}: {
	initContext: InitCustomerEntitlementContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
}): InitCustomerEntitlementFields => {
	const { balance, entities } = initCustomerEntitlementBalance({
		initContext,
		entitlement,
	});
	const isBoolean = isBooleanEntitlement({ entitlement });
	const unlimited = isBoolean
		? null
		: isUnlimitedEntitlement({ entitlement });
	const usageAllowed = initCustomerEntitlementUsageAllowed({
		initContext,
		initOptions,
		entitlement,
	});
	const nextResetAt = initCustomerEntitlementNextResetAt({
		initContext,
		initOptions,
		entitlement,
	});
	const resetCycleAnchor = entitlementToResetCycleAnchor({
		entitlement,
		resetCycleAnchor: initContext.resetCycleAnchor,
		now: initContext.now,
	});
	const relatedPrice = initOptions?.customerLicenseLinkId
		? undefined
		: entToPrice({
				ent: entitlement,
				prices: initContext.fullProduct?.prices ?? [],
			});
	const separateInterval = entitlementAndPriceHaveSeparateInterval({
		entitlement,
		price: relatedPrice,
	});

	return {
		internal_customer_id: initContext.fullCustomer.internal_id,
		internal_feature_id: entitlement.internal_feature_id,
		internal_entity_id: null,
		feature_id: entitlement.feature.id,
		customer_id: initContext.fullCustomer.id,
		entitlement_id: entitlement.id,
		created_at: Date.now(),
		unlimited,
		balance,
		additional_balance: 0,
		adjustment: 0,
		entities,
		usage_allowed: usageAllowed,
		separate_interval: separateInterval,
		reset_cycle_anchor: resetCycleAnchor,
		next_reset_at: nextResetAt,
		expires_at: null,
		cache_version: 0,
		external_id: null,
	};
};
