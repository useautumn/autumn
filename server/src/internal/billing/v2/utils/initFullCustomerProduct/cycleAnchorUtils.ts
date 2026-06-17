import {
	type EntitlementWithFeature,
	type FullCusProduct,
	type FullProduct,
	isBooleanEntitlement,
	isCustomerProductPaidRecurring,
	isLifetimeEntitlement,
	isProductPaidAndRecurring,
	isUnlimitedEntitlement,
} from "@autumn/shared";

export const productToBillingCycleAnchor = ({
	product,
	billingCycleAnchor,
	now,
}: {
	product: FullProduct;
	billingCycleAnchor: number | "now";
	now: number;
}): number | null => {
	if (!isProductPaidAndRecurring(product)) return null;

	return billingCycleAnchor === "now" ? now : billingCycleAnchor;
};

export const customerProductToBillingCycleAnchor = ({
	customerProduct,
	billingCycleAnchor,
	now,
}: {
	customerProduct: FullCusProduct;
	billingCycleAnchor: number | "now";
	now: number;
}): number | null => {
	if (!isCustomerProductPaidRecurring(customerProduct)) return null;

	return billingCycleAnchor === "now" ? now : billingCycleAnchor;
};

export const entitlementToResetCycleAnchor = ({
	entitlement,
	resetCycleAnchor,
	now,
}: {
	entitlement: EntitlementWithFeature;
	resetCycleAnchor: number | "now";
	now: number;
}): number | null => {
	if (isBooleanEntitlement({ entitlement })) return null;
	if (isUnlimitedEntitlement({ entitlement })) return null;
	if (isLifetimeEntitlement({ entitlement })) return null;

	return resetCycleAnchor === "now" ? now : resetCycleAnchor;
};
