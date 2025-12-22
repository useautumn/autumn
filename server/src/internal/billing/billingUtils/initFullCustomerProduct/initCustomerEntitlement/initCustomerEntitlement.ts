import {
	type CustomerEntitlement,
	type EntitlementWithFeature,
	type InitFullCusProductContext,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { generateId } from "@server/utils/genUtils";
import { initCusEntitlementBalance } from "./initCusEntitlementBalance";
import { initCusEntUsageAllowed } from "./initCusEntUsageAllowed";

// MAIN FUNCTION
export const initCusEntitlement = ({
	initContext,
	entitlement,
	cusProductId,
}: {
	initContext: InitFullCusProductContext;
	entitlement: EntitlementWithFeature;
	cusProductId: string;
}): CustomerEntitlement => {
	const { balance, entities } = initCusEntitlementBalance({
		initContext,
		entitlement,
	});

	// Get unlimited
	const isBoolean = isBooleanEntitlement({ entitlement });
	const unlimited = isBoolean ? null : isUnlimitedEntitlement({ entitlement });

	// Usage allowed:
	const usageAllowed = initCusEntUsageAllowed({
		initContext,
		entitlement,
	});

	// 1. Initialize balance / entities column
	// now = now || Date.now();

	// const nextResetAtValue = initNextResetAt({
	// 	entitlement,
	// 	nextResetAt,
	// 	// keepResetIntervals,
	// 	// existingCusEnt,
	// 	trialEndsAt,
	// 	freeTrial,
	// 	anchorToUnix,
	// 	now,
	// });

	const nextResetAt = Date.now();

	const { fullCus, product } = initContext;

	return {
		id: generateId("cus_ent"),
		internal_customer_id: fullCus.internal_id,
		internal_feature_id: entitlement.internal_feature_id,
		feature_id: entitlement.feature.id,
		customer_id: fullCus.id,
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
