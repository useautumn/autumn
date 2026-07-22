import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";

type CustomerEntitlementWithPooledFlag = Pick<
	FullCustomerEntitlement,
	"entitlement"
>;

export const isPooledSourceCustomerEntitlement = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: CustomerEntitlementWithPooledFlag;
	customerProduct: FullCusProduct | null | undefined;
}): boolean =>
	customerEntitlement.entitlement.pooled === true &&
	Boolean(customerProduct?.internal_entity_id);

export const isSyntheticPooledBalanceCustomerEntitlement = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: CustomerEntitlementWithPooledFlag;
	customerProduct: FullCusProduct | null | undefined;
}): boolean =>
	customerEntitlement.entitlement.pooled === true && customerProduct === null;

export const isManagedPooledCustomerEntitlement = (params: {
	customerEntitlement: CustomerEntitlementWithPooledFlag;
	customerProduct: FullCusProduct | null | undefined;
}): boolean =>
	isPooledSourceCustomerEntitlement(params) ||
	isSyntheticPooledBalanceCustomerEntitlement(params);

export const customerProductHasPooledSource = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct | null | undefined;
}): boolean =>
	Boolean(customerProduct?.internal_entity_id) &&
	(customerProduct?.customer_entitlements.some((customerEntitlement) =>
		isPooledSourceCustomerEntitlement({
			customerEntitlement,
			customerProduct,
		}),
	) ??
		false);
