import {
	EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { cusEntToCusPrice } from "@shared/utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { priceToBillingMethod } from "@shared/utils/productUtils/priceUtils/convertPriceUtils";

export type CustomerEntitlementCarryIdentity = {
	internalFeatureId: string;
	interval: string;
	intervalCount: number;
	entityFeatureId: string | null;
	billingMethod: string | null;
};

export const carryIdentityToKey = (
	identity: CustomerEntitlementCarryIdentity,
) =>
	[
		identity.internalFeatureId,
		identity.interval,
		identity.intervalCount,
		identity.entityFeatureId ?? "",
		identity.billingMethod ?? "",
	].join(":");

export const customerEntitlementToCarryIdentity = ({
	customerEntitlement,
	customerProduct,
}: {
	customerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}): CustomerEntitlementCarryIdentity => {
	const customerEntitlementWithProduct = {
		...customerEntitlement,
		customer_product: customerProduct,
	} satisfies FullCusEntWithFullCusProduct;
	const customerPrice = cusEntToCusPrice({
		cusEnt: customerEntitlementWithProduct,
	});
	const entitlement = customerEntitlement.entitlement;

	return {
		internalFeatureId: entitlement.internal_feature_id,
		interval:
			customerPrice?.price.config.interval ??
			entitlement.interval ??
			EntInterval.Lifetime,
		intervalCount: entitlement.interval_count ?? 1,
		entityFeatureId: entitlement.entity_feature_id ?? null,
		billingMethod: priceToBillingMethod({ price: customerPrice?.price }) ?? null,
	};
};
