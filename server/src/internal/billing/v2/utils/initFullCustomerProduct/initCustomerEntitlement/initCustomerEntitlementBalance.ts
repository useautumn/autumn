import {
	type EntitlementWithFeature,
	type EntityBalance,
	entToOptions,
	entToPrice,
	type FeatureOptions,
	type FullCustomer,
	type FullProduct,
	getStartingBalance,
	type InitFullCustomerProductContext,
	isBooleanEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { initCustomerEntitlementEntities } from "./initCustomerEntitlementEntities";

export const initCustomerEntitlementBalance = ({
	initContext,
	entitlement,
}: {
	initContext:
		| InitFullCustomerProductContext
		| {
				fullCustomer: FullCustomer;
				fullProduct: FullProduct;
				featureQuantities: FeatureOptions[];
		  };
	entitlement: EntitlementWithFeature;
}): { balance: number; entities: Record<string, EntityBalance> | null } => {
	// 1. If entitlement is boolean or unlimited, return 0
	const isBoolean = isBooleanEntitlement({ entitlement });
	const isUnlimited = isUnlimitedEntitlement({ entitlement });

	if (isBoolean || isUnlimited) {
		return { balance: 0, entities: null };
	}

	// 2. Get starting balance
	const { fullCustomer, featureQuantities } = initContext;

	const price = entToPrice({
		ent: entitlement,
		prices: initContext.fullProduct.prices,
	});

	const options = entToOptions({
		ent: entitlement,
		options: featureQuantities,
	});

	const startingBalance = getStartingBalance({
		entitlement,
		options,
		relatedPrice: price,
	});

	// 3. Get entitlement entities if entity scoped
	const entities = initCustomerEntitlementEntities({
		entitlement,
		customerEntities: fullCustomer.entities,
		startingBalance,
	});

	return { balance: startingBalance, entities };
};
