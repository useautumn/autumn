import {
	type CustomerEntitlement,
	type EntitlementWithFeature,
	type InitFullCustomerProductContext,
	type InitFullCustomerProductOptions,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { generateId } from "@server/utils/genUtils";
import { initCustomerEntitlementBalance } from "./initCustomerEntitlementBalance";
import { initCustomerEntitlementNextResetAt } from "./initCustomerEntitlementNextResetAt";
import { initCustomerEntitlementUsageAllowed } from "./initCustomerEntitlementUsageAllowed";

// MAIN FUNCTION
export const initCustomerEntitlement = ({
	initContext,
	initOptions,
	entitlement,
	cusProductId,
}: {
	initContext: InitFullCustomerProductContext;
	initOptions?: InitFullCustomerProductOptions;
	entitlement: EntitlementWithFeature;
	cusProductId: string;
}): CustomerEntitlement => {
	const { balance, entities } = initCustomerEntitlementBalance({
		initContext,
		entitlement,
	});

	// Get unlimited
	const isBoolean = isBooleanEntitlement({ entitlement });
	const unlimited = isBoolean ? null : isUnlimitedEntitlement({ entitlement });

	// Usage allowed:
	const usageAllowed = initCustomerEntitlementUsageAllowed({
		initContext,
		entitlement,
	});

	const nextResetAt = initCustomerEntitlementNextResetAt({
		initContext,
		initOptions,
		entitlement,
	});

	const { fullCustomer } = initContext;

	return {
		id: generateId("cus_ent"),
		internal_customer_id: fullCustomer.internal_id,
		internal_feature_id: entitlement.internal_feature_id,
		feature_id: entitlement.feature.id,
		customer_id: fullCustomer.id,
		entitlement_id: entitlement.id,
		customer_product_id: cusProductId,
		created_at: Date.now(),

		// Entitlement fields
		unlimited,
		balance,
		additional_balance: 0,
		adjustment: 0,
		entities,
		usage_allowed: usageAllowed,
		next_reset_at: nextResetAt,
	};
};

// // 3. Define expires at (TODO next time...)
// const isBooleanFeature = entitlement.feature.type === FeatureType.Boolean;
// let usageAllowed = false;
// if (
// 	relatedPrice &&
// 	(getBillingType(relatedPrice.config!) === BillingType.UsageInArrear ||
// 		getBillingType(relatedPrice.config!) === BillingType.InArrearProrated)
// ) {
// 	usageAllowed = true;
// }
// if (notNullish(productOptions?.quantity) && notNullish(newBalance)) {
// 	newBalance = new Decimal(newBalance!)
// 		.mul(productOptions?.quantity || 1)
// 		.toNumber();
// }
