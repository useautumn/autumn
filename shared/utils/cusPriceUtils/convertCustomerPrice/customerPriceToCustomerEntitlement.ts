import {
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	InternalError,
	type UsagePriceConfig,
} from "@autumn/shared";

// Overload: errorOnNotFound = true → guaranteed FullCustomerEntitlement
export function customerPriceToCustomerEntitlement(params: {
	customerPrice: FullCustomerPrice;
	customerEntitlements: FullCustomerEntitlement[];
	errorOnNotFound: true;
}): FullCustomerEntitlement;

// Overload: errorOnNotFound = false/undefined → FullCustomerEntitlement | undefined
export function customerPriceToCustomerEntitlement(params: {
	customerPrice: FullCustomerPrice;
	customerEntitlements: FullCustomerEntitlement[];
	errorOnNotFound?: false;
}): FullCustomerEntitlement | undefined;

// Implementation
export function customerPriceToCustomerEntitlement({
	customerPrice,
	customerEntitlements,
	errorOnNotFound,
}: {
	customerPrice: FullCustomerPrice;
	customerEntitlements: FullCustomerEntitlement[];
	errorOnNotFound?: boolean;
}): FullCustomerEntitlement | undefined {
	const config = customerPrice.price.config as UsagePriceConfig;
	if (!config) {
		if (errorOnNotFound) {
			throw new InternalError({
				message: `No config found for customer price: ${customerPrice.id}`,
			});
		}
		return undefined;
	}

	const customerEntitlement = customerEntitlements.find(
		(ce) =>
			ce.customer_product_id === customerPrice.customer_product_id &&
			ce.entitlement.id === customerPrice.price.entitlement_id,
	);

	if (errorOnNotFound && !customerEntitlement) {
		throw new InternalError({
			message: `Customer entitlement not found for customer price: ${customerPrice.id}`,
		});
	}

	return customerEntitlement;
}
